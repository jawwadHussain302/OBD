import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { ObdAdapter, OBD_ADAPTER } from '../adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export type TelemetryMetricId = 'rpm' | 'coolantTemp' | 'maf' | 'stftB1' | 'ltftB1' | 'throttlePosition';

@Injectable({ providedIn: 'root' })
export class LiveTelemetryService {
  private readonly frameHistorySubject = new BehaviorSubject<readonly ObdLiveFrame[]>([]);

  readonly frameHistory$ = this.frameHistorySubject.asObservable();
  readonly latestFrame$ = this.frameHistory$.pipe(map(history => history.length > 0 ? history[history.length - 1] : null));
  readonly connectionStatus$;

  constructor(@Inject(OBD_ADAPTER) private readonly obdAdapter: ObdAdapter) {
    this.connectionStatus$ = this.obdAdapter.connectionStatus$.pipe(distinctUntilChanged());

    this.obdAdapter.data$.subscribe(frame => {
      this.frameHistorySubject.next([...this.frameHistorySubject.value, frame].slice(-120));
    });

    this.connectionStatus$.subscribe(status => {
      if (status === 'disconnected' || status === 'error') {
        this.frameHistorySubject.next([]);
      }
    });
  }

  metricValue(frame: ObdLiveFrame | null, id: TelemetryMetricId): number | null {
    if (!frame) return null;
    switch (id) {
      case 'rpm': return frame.rpm;
      case 'coolantTemp': return frame.coolantTemp;
      case 'maf': return frame.maf ?? null;
      case 'stftB1': return frame.stftB1;
      case 'ltftB1': return frame.ltftB1;
      case 'throttlePosition': return frame.throttlePosition;
    }
  }

  getFrameHistorySnapshot(): readonly ObdLiveFrame[] {
    return this.frameHistorySubject.value;
  }
}
