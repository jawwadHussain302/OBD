import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

import { ObdAdapter, ObdDebugInfo } from './obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import {
  Elm327CommandService,
  BleWriteCharacteristic,
  BleNotifyCharacteristic,
} from './elm327-command.service';
import { ObdPidParserService } from './obd-pid-parser.service';
import { parseVinResponse, extractManufacturer } from '../utils/vin-decoder';
import { parseDtcResponse } from '../utils/dtc-parser';

// ── Minimal Web Bluetooth type declarations ────────────────────────────────
// (avoids @types/web-bluetooth; mirrors the real BluetoothRemoteGATT* shape)

/** A characteristic that supports both reading (notify) and writing. */
interface BleCharacteristic extends BleWriteCharacteristic, BleNotifyCharacteristic {}

interface BleService {
  getCharacteristic(uuid: string): Promise<BleCharacteristic>;
}

interface BleGattServer {
  connect(): Promise<BleGattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BleService>;
}

interface BleDevice extends EventTarget {
  name?: string;
  gatt?: BleGattServer;
}

interface BluetoothApi {
  requestDevice(options: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }): Promise<BleDevice>;
}

// ── GATT service / characteristic UUIDs ───────────────────────────────────

// Variant A — Generic BLE Serial (most common OBD adapters)
const SERVICE_A   = '0000fff0-0000-1000-8000-00805f9b34fb';
const TX_A        = '0000fff2-0000-1000-8000-00805f9b34fb';
const RX_A        = '0000fff1-0000-1000-8000-00805f9b34fb';

// Variant B — Nordic UART Service (fallback)
const SERVICE_NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_NUS      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const RX_NUS      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

// ── ELM327 constants ───────────────────────────────────────────────────────

/**
 * Init sequence sent once after BLE connection.
 * ATZ  — full reset (chip responds with version string + ">")
 * ATE0 — echo off
 * ATL0 — linefeeds off
 * ATS0 — spaces off (cleaner hex for the parser)
 * ATH0 — headers off
 * ATSP0 — auto-detect OBD protocol
 */
const INIT_COMMANDS = ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0'] as const;

/**
 * Mode-01 PIDs polled every cycle.
 * 010C — RPM           ((A×256)+B)/4
 * 010D — Speed         A (km/h)
 * 0105 — Coolant temp  A−40 (°C)
 * 0104 — Engine load   (A×100)/255 (%)
 * 0106 — STFT Bank 1        (A−128)×100/128 (%)
 * 0107 — LTFT Bank 1        (A−128)×100/128 (%)
 * 0111 — Throttle position  (A×100)/255 (%)
 * 010F — Intake Air Temp    A−40 (°C)
 * 0110 — MAF                ((A×256)+B)/100 (g/s)
 */
const POLL_PIDS = ['010C', '010D', '0105', '0104', '0106', '0107', '0111', '010F', '0110'] as const;

/** Pause between poll cycles (ms). Prevents flooding the BLE link. */
const POLL_INTERVAL_MS = 200;

// ── Default frame ──────────────────────────────────────────────────────────

/** Returns an ObdLiveFrame with safe zero defaults for all required fields. */
function makeDefaultFrame(): ObdLiveFrame {
  return {
    timestamp: Date.now(),
    rpm: 0,
    speed: 0,
    engineLoad: 0,
    coolantTemp: 0,
    intakeAirTemp: 0,
    stftB1: 0,
    ltftB1: 0,
    throttlePosition: 0,
  };
}

// ── Service ────────────────────────────────────────────────────────────────

/**
 * Implements ObdAdapter over Web Bluetooth + ELM327.
 *
 * Usage:
 *   await adapter.connect();   // opens BLE picker, inits ELM327, starts polling
 *   adapter.data$.subscribe(frame => ...);
 *   await adapter.disconnect();
 */
@Injectable({ providedIn: 'root' })
export class WebBluetoothElm327AdapterService implements ObdAdapter, OnDestroy {

  private readonly dataSubject = new Subject<ObdLiveFrame>();
  private readonly statusSubject = new BehaviorSubject<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected');
  private readonly debugSubject = new BehaviorSubject<ObdDebugInfo>({
    lastFrameTime: null,
    pollingHz: 0,
    failingPids: []
  });

  readonly data$: Observable<ObdLiveFrame> = this.dataSubject.asObservable().pipe(shareReplay(1));
  readonly connectionStatus$ = this.statusSubject.asObservable().pipe(shareReplay(1));
  readonly debug$: Observable<ObdDebugInfo> = this.debugSubject.asObservable().pipe(shareReplay(1));

  private readonly vinInfoSubject = new BehaviorSubject<{ vin: string; manufacturer: string } | null>(null);
  readonly vinInfo$: Observable<{ vin: string; manufacturer: string } | null> = this.vinInfoSubject.asObservable();
  private readonly dtcSubject = new BehaviorSubject<readonly string[]>([]);
  readonly dtcCodes$: Observable<readonly string[]> = this.dtcSubject.asObservable();

  private gattServer: BleGattServer | null = null;
  private device: BleDevice | null = null;
  private polling = false;
  private disconnecting = false;
  private currentFrame: ObdLiveFrame = makeDefaultFrame();
  
  // Debug tracking
  private lastCycleTime = 0;
  private debugState: ObdDebugInfo = {
    lastFrameTime: null,
    pollingHz: 0,
    failingPids: []
  };

  constructor(
    private readonly commandService: Elm327CommandService,
    private readonly parser: ObdPidParserService,
  ) {}

  ngOnDestroy(): void {
    this.cleanupConnection('disconnected', true);
  }

  // ── ObdAdapter: connect ────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.statusSubject.value === 'connected' || this.statusSubject.value === 'connecting') {
      return;
    }

    const bluetooth = (navigator as unknown as { bluetooth?: BluetoothApi }).bluetooth;
    if (!bluetooth) {
      throw new Error(
        'Web Bluetooth is not available. Use Chrome or Edge on localhost / HTTPS.'
      );
    }

    this.statusSubject.next('connecting');

    try {
      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_A, SERVICE_NUS],
      });
      this.device = device;
      this.device.addEventListener('gattserverdisconnected', this.onGattDisconnected);

      if (!device.gatt) {
        throw new Error('GATT server not available on this device.');
      }

      const server = await device.gatt.connect();
      this.gattServer = server;

      const { tx, rx } = await this.resolveCharacteristics(server);
      this.commandService.attach(tx, rx);

      await this.runInitSequence();

      this.currentFrame = makeDefaultFrame();
      this.debugState = { lastFrameTime: null, pollingHz: 0, failingPids: [] };
      this.lastCycleTime = performance.now();
      this.polling = true;
      this.statusSubject.next('connected');

      // Fetch VIN without blocking the connection
      this.fetchVin();
      this.fetchDtcs();

      // Fire-and-forget: polling loop runs independently until disconnect()
      this.startPollLoop();

    } catch (err) {
      this.cleanupConnection('error', true);
      throw err;
    }
  }

  // ── ObdAdapter: disconnect ─────────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this.disconnecting || this.statusSubject.value === 'disconnected') {
      return;
    }

    this.disconnecting = true;
    this.cleanupConnection('disconnected', true);
    this.disconnecting = false;
  }

  // ── ObdAdapter: sendCommand ────────────────────────────────────────────

  async sendCommand(command: string): Promise<string> {
    return this.commandService.send(command);
  }

  // ── Private / Internal ─────────────────────────────────────────────────

  private async fetchVin(): Promise<void> {
    try {
      const response = await this.sendCommand('0902');
      const vin = parseVinResponse(response);
      if (vin) {
        const manufacturer = extractManufacturer(vin);
        this.vinInfoSubject.next({ vin, manufacturer });
      }
    } catch (err) {
      console.warn('Failed to fetch VIN:', err);
    }
  }

  private async fetchDtcs(): Promise<void> {
    const codes: string[] = [];

    for (const command of ['03', '07'] as const) {
      try {
        const response = await this.sendCommand(command);
        if (this.statusSubject.value !== 'connected') return;

        const parsed = parseDtcResponse(response);
        for (const code of parsed) {
          if (!codes.includes(code)) {
            codes.push(code);
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch Mode ${command} DTCs:`, err);
      }
    }

    if (this.statusSubject.value === 'connected') {
      this.dtcSubject.next(codes);
    }
  }

  // ── BLE GATT setup ────────────────────────────────────────────────────

  /**
   * Resolves TX (write) and RX (notify) characteristics.
   * Tries Generic BLE Serial (FFF0) first; falls back to Nordic UART (6E40).
   */
  private async resolveCharacteristics(
    server: BleGattServer,
  ): Promise<{ tx: BleWriteCharacteristic; rx: BleNotifyCharacteristic }> {
    // Try Variant A — Generic BLE Serial
    try {
      const svc = await server.getPrimaryService(SERVICE_A);
      const rx  = await svc.getCharacteristic(RX_A);
      const tx  = await svc.getCharacteristic(TX_A);
      await rx.startNotifications();
      return { tx, rx };
    } catch {
      // Not found — fall through to Variant B
    }

    // Variant B — Nordic UART Service
    const svc = await server.getPrimaryService(SERVICE_NUS);
    const rx  = await svc.getCharacteristic(RX_NUS);
    const tx  = await svc.getCharacteristic(TX_NUS);
    await rx.startNotifications();
    return { tx, rx };
  }

  // ── ELM327 init sequence ──────────────────────────────────────────────

  /**
   * Sends the standard init commands in order.
   * ATZ resets the chip; the ">" prompt only arrives once the chip is back up,
   * so no extra delay is needed — commandService.send() handles the wait.
   */
  private async runInitSequence(): Promise<void> {
    for (const cmd of INIT_COMMANDS) {
      await this.commandService.send(cmd);
    }
  }

  // ── PID polling loop ──────────────────────────────────────────────────

  private startPollLoop(): void {
    const loop = async (): Promise<void> => {
      while (this.polling) {
        await this.pollOneCycle();
        if (this.polling) {
          await this.delay(POLL_INTERVAL_MS);
        }
      }
    };

    loop().catch(() => {
      // Unexpected error in the loop — mark as error and stop
      if (this.polling) {
        this.polling = false;
        this.statusSubject.next('error');
      }
    });
  }

  /**
   * Sends each PID in sequence, parses the response, and emits one frame.
   * Null responses (NO DATA, timeout, malformed) are skipped — the previous
   * valid value is retained in currentFrame.
   */
  private async pollOneCycle(): Promise<void> {
    for (const pid of POLL_PIDS) {
      if (!this.polling) return;

      try {
        const raw   = await this.commandService.send(pid);
        if (!this.polling) return;

        const value = this.parser.parse(pid, raw);
        if (value !== null) {
          this.applyPidValue(pid, value);
        } else {
          this.trackFailedPid(pid, raw || 'NO DATA');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!this.polling || message.includes('disconnected') || message.includes('not attached')) {
          this.cleanupConnection('disconnected');
          return;
        }

        this.trackFailedPid(pid, message || 'TIMEOUT');
        // Individual PID timeout or disconnected — skip and continue
      }
    }

    if (this.polling) {
      const now = Date.now();
      this.currentFrame.timestamp = now;
      this.dataSubject.next({ ...this.currentFrame });
      
      const cycleEnd = performance.now();
      const elapsed = cycleEnd - this.lastCycleTime;
      this.lastCycleTime = cycleEnd;
      
      this.debugState.lastFrameTime = now;
      this.debugState.pollingHz = elapsed > 0 ? 1000 / elapsed : 0;
      this.debugSubject.next({ ...this.debugState });
    }
  }

  private trackFailedPid(pid: string, response: string): void {
    // Keep max 50 items in the failure log
    if (this.debugState.failingPids.length > 50) {
      this.debugState.failingPids.shift();
    }
    this.debugState.failingPids.push({
      pid,
      command: pid,
      response,
      timestamp: Date.now()
    });
    this.debugSubject.next({ ...this.debugState });
  }

  /** Write a parsed value into the current frame accumulator. */
  private applyPidValue(pid: string, value: number): void {
    switch (pid) {
      case '010C': this.currentFrame.rpm         = value; break;
      case '010D': this.currentFrame.speed       = value; break;
      case '0105': this.currentFrame.coolantTemp = value; break;
      case '0104': this.currentFrame.engineLoad  = value; break;
      case '0106': this.currentFrame.stftB1            = value; break;
      case '0107': this.currentFrame.ltftB1            = value; break;
      case '0111': this.currentFrame.throttlePosition  = value; break;
      case '010F': this.currentFrame.intakeAirTemp     = value; break;
      case '0110': this.currentFrame.maf               = value; break;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private cleanupConnection(status: 'disconnected' | 'error', disconnectGatt = false): void {
    this.polling = false;
    this.commandService.detach();

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
      this.device = null;
    }

    if (disconnectGatt) {
      this.gattServer?.disconnect();
    }

    this.gattServer = null;
    this.vinInfoSubject.next(null);
    this.dtcSubject.next([]);
    this.statusSubject.next(status);
  }

  private onGattDisconnected = (): void => {
    this.cleanupConnection('disconnected');
  };
}
