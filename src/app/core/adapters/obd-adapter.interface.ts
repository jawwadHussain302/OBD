import { Observable } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export interface ObdAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly data$: Observable<ObdLiveFrame>;
  readonly connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'>;
  sendCommand(command: string): Promise<string>;
}
