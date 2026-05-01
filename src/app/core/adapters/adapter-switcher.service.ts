import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, switchMap } from 'rxjs';
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
  private readonly emptyVinInfo$ = of<{ vin: string; manufacturer: string } | null>(null);
  private readonly emptyDtcCodes$ = of<readonly string[]>([]);
  private readonly emptyDebug$ = of<ObdDebugInfo>({
    lastFrameTime: null,
    pollingHz: 0,
    failingPids: []
  });
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
        ? (this.simAdapter.vinInfo$ ?? this.emptyVinInfo$)
        : (this.realAdapter.vinInfo$ ?? this.emptyVinInfo$))
    );

    this.dtcCodes$ = this.modeSubject.pipe(
      switchMap(mode => mode === 'simulated'
        ? (this.simAdapter.dtcCodes$ ?? this.emptyDtcCodes$)
        : (this.realAdapter.dtcCodes$ ?? this.emptyDtcCodes$))
    );

    this.debug$ = this.modeSubject.pipe(
      switchMap(_mode => this.realAdapter.debug$ ?? this.emptyDebug$)
    );
  }

  // ─── Mode control ──────────────────────────────────────────────────────────

  public getMode(): AdapterMode {
    return this.modeSubject.value;
  }

  public async setMode(mode: AdapterMode): Promise<void> {
    const current = this.modeSubject.value;
    if (current === mode) return;

    // Disconnect the outgoing adapter before switching
    if (current === 'simulated') {
      await this.simAdapter.disconnect();
    } else {
      await this.realAdapter.disconnect();
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
