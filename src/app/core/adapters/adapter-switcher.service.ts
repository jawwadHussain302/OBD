import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, switchMap } from 'rxjs';
import { ObdAdapter, ObdDebugInfo } from './obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { WebBluetoothElm327AdapterService } from './web-bluetooth-elm327-adapter.service';
import { SimulatorObdAdapterService } from './simulator-obd-adapter.service';

export type AdapterMode = 'real' | 'simulated';

/**
 * Wraps the real BLE adapter and the offline simulator.
 * Registered as OBD_ADAPTER in app.config — all consumers are unaware of the switch.
 */
@Injectable({ providedIn: 'root' })
export class AdapterSwitcherService implements ObdAdapter {

  private modeSubject = new BehaviorSubject<AdapterMode>('simulated');
  public readonly mode$: Observable<AdapterMode> = this.modeSubject.asObservable();

  public readonly data$: Observable<ObdLiveFrame>;
  public readonly connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'>;
  public readonly vinInfo$: Observable<{ vin: string; manufacturer: string } | null>;
  public readonly dtcCodes$: Observable<readonly string[]>;
  public readonly debug$: Observable<ObdDebugInfo>;

  constructor(
    private realAdapter: WebBluetoothElm327AdapterService,
    private simAdapter: SimulatorObdAdapterService,
  ) {
    this.data$ = this.modeSubject.pipe(
      switchMap(mode => mode === 'simulated' ? this.simAdapter.data$ : this.realAdapter.data$)
    );

    this.connectionStatus$ = this.modeSubject.pipe(
      switchMap(mode => mode === 'simulated'
        ? this.simAdapter.connectionStatus$
        : this.realAdapter.connectionStatus$)
    );

    this.vinInfo$ = this.modeSubject.pipe(
      switchMap(mode => mode === 'simulated'
        ? (this.simAdapter.vinInfo$ ?? new BehaviorSubject(null))
        : (this.realAdapter.vinInfo$ ?? new BehaviorSubject(null)))
    );

    this.dtcCodes$ = this.modeSubject.pipe(
      switchMap(mode => mode === 'simulated'
        ? (this.simAdapter.dtcCodes$ ?? new BehaviorSubject([]))
        : (this.realAdapter.dtcCodes$ ?? new BehaviorSubject([])))
    );

    this.debug$ = this.modeSubject.pipe(
      switchMap(_mode => this.realAdapter.debug$ ?? new BehaviorSubject<ObdDebugInfo>({
        lastFrameTime: null,
        pollingHz: 0,
        failingPids: []
      }))
    );
  }

  // ─── Mode control ──────────────────────────────────────────────────────────

  public getMode(): AdapterMode {
    return this.modeSubject.value;
  }

  public setMode(mode: AdapterMode): void {
    const current = this.modeSubject.value;
    if (current === mode) return;

    // Disconnect the outgoing adapter before switching
    if (current === 'simulated') {
      this.simAdapter.disconnect();
    } else {
      this.realAdapter.disconnect();
    }

    this.modeSubject.next(mode);
  }

  // ─── ObdAdapter delegation ─────────────────────────────────────────────────

  public connect(): Promise<void> {
    return this.active().connect();
  }

  public disconnect(): Promise<void> {
    return this.active().disconnect();
  }

  public sendCommand(command: string): Promise<string> {
    return this.active().sendCommand(command);
  }

  private active(): ObdAdapter {
    return this.modeSubject.value === 'simulated' ? this.simAdapter : this.realAdapter;
  }
}
