import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, interval, Subscription } from 'rxjs';
import { ObdAdapter } from './obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

/** Phase definition: frames at 1 Hz, RPM ramp target */
interface RpmPhase {
  frames: number;
  rpmTarget: number;
}

const RPM_PHASES: RpmPhase[] = [
  { frames: 40, rpmTarget: 820  },   // idle
  { frames: 30, rpmTarget: 2800 },   // ramp up
  { frames: 30, rpmTarget: 3100 },   // high rev
  { frames: 30, rpmTarget: 820  },   // drop back to idle
];

const TOTAL_CYCLE_FRAMES = RPM_PHASES.reduce((s, p) => s + p.frames, 0); // 26

/**
 * Offline simulator adapter.
 * Generates realistic-looking OBD frames without any hardware.
 * Implements the same ObdAdapter interface so the rest of the app is unaware.
 */
@Injectable({ providedIn: 'root' })
export class SimulatorObdAdapterService implements ObdAdapter {
  private connectionStatusSubject = new BehaviorSubject<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected');

  private dataSubject = new Subject<ObdLiveFrame>();

  public connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'> =
    this.connectionStatusSubject.asObservable();

  public data$: Observable<ObdLiveFrame> = this.dataSubject.asObservable();

  public vinInfo$: Observable<{ vin: string; manufacturer: string } | null> =
    new BehaviorSubject<{ vin: string; manufacturer: string } | null>({
      vin: 'SIM00000000000000',
      manufacturer: 'Simulator',
    }).asObservable();

  public dtcCodes$: Observable<readonly string[]> =
    new BehaviorSubject<readonly string[]>([]).asObservable();

  private streamSub?: Subscription;
  private frameIndex = 0;
  private coolantTemp = 20;
  private currentRpm = 820;
  /** Incremented on every disconnect to cancel an in-flight connect delay. */
  private connectToken = 0;

  public async connect(): Promise<void> {
    if (this.connectionStatusSubject.value === 'connected') return;
    this.connectionStatusSubject.next('connecting');
    const token = ++this.connectToken;
    await new Promise<void>(resolve => setTimeout(resolve, 600));
    // If disconnect() was called during the 600 ms delay, abort silently.
    if (token !== this.connectToken) return;
    this.connectionStatusSubject.next('connected');
    this.startStream();
  }

  public async disconnect(): Promise<void> {
    // Invalidate any pending connect delay
    this.connectToken++;
    this.streamSub?.unsubscribe();
    this.frameIndex = 0;
    this.coolantTemp = 20;
    this.currentRpm = 820;
    this.connectionStatusSubject.next('disconnected');
  }

  public async sendCommand(command: string): Promise<string> {
    return `SIM_OK: ${command}\r\n>`;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private startStream(): void {
    this.streamSub?.unsubscribe();
    this.streamSub = interval(200).subscribe(() => this.emitFrame());
  }

  private emitFrame(): void {
    this.frameIndex++;

    const rpm = this.nextRpm();
    const coolant = this.nextCoolant();
    const maf = this.calcMaf(rpm);
    const stft = this.calcStft(coolant);
    const ltft = coolant < 60 ? 8 + Math.random() * 4 - (coolant / 60) * 6
                              : Math.random() * 3 - 1;

    // Occasional instability events (~5% stall, ~3% spike)
    const rand = Math.random();
    const finalRpm = rand < 0.05 ? 280 + Math.random() * 150
                   : rand < 0.08 ? rpm + 700 + Math.random() * 300
                   : rpm;

    const frame: ObdLiveFrame = {
      timestamp:        Date.now(),
      rpm:              Math.max(0, Math.round(finalRpm)),
      speed:            0,
      engineLoad:       Math.min(100, 18 + (finalRpm / 4000) * 65 + Math.random() * 5),
      coolantTemp:      coolant,
      intakeAirTemp:    18 + Math.random() * 5,
      stftB1:           stft,
      ltftB1:           parseFloat(ltft.toFixed(2)),
      maf,
      throttlePosition: Math.min(100, 8 + (finalRpm / 4000) * 55 + Math.random() * 5),
    };

    this.dataSubject.next(frame);
  }

  /** Interpolated RPM following the RPM_PHASES cycle */
  private nextRpm(): number {
    const cyclePos = this.frameIndex % TOTAL_CYCLE_FRAMES;
    let offset = 0;
    let prev = RPM_PHASES[RPM_PHASES.length - 1].rpmTarget;

    for (const phase of RPM_PHASES) {
      if (cyclePos < offset + phase.frames) {
        const t = (cyclePos - offset) / phase.frames;
        this.currentRpm = prev + (phase.rpmTarget - prev) * t + (Math.random() * 80 - 40);
        return this.currentRpm;
      }
      prev = phase.rpmTarget;
      offset += phase.frames;
    }

    return this.currentRpm;
  }

  /** Coolant rises 20 → 90 °C over ~120 frames, then stabilises */
  private nextCoolant(): number {
    if (this.coolantTemp < 90) {
      this.coolantTemp = Math.min(90, this.coolantTemp + 0.6);
    } else {
      this.coolantTemp = 90 + Math.random() * 1.5 - 0.75;
    }
    return Math.round(this.coolantTemp);
  }

  /** MAF proportional to RPM (rough 2.0 L engine estimate, g/s) */
  private calcMaf(rpm: number): number {
    return parseFloat((0.0032 * rpm + Math.random() * 0.4).toFixed(2));
  }

  /**
   * STFT: slightly high when cold (engine fighting over-rich cold-start enrichment),
   * settles near 0 once warm.
   */
  private calcStft(coolant: number): number {
    if (coolant < 60) {
      const coldBias = (1 - coolant / 60) * 6;
      return parseFloat((coldBias + Math.random() * 4 - 2).toFixed(2));
    }
    return parseFloat((Math.random() * 4 - 2).toFixed(2));
  }
}
