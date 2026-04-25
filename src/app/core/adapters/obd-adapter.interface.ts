import { Observable } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

/**
 * Common interface for all OBD2 hardware adapters.
 * Ensures hardware-agnostic behavior across the application.
 */
export interface ObdAdapter {
  /** 
   * Stream of real-time vehicle data frames.
   */
  data$: Observable<ObdLiveFrame>;

  /** 
   * Current connection state of the adapter.
   */
  connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'>;

  /** 
   * Establishes a link with the OBD2 hardware.
   */
  connect(): Promise<void>;

  /** 
   * Safely terminates the hardware link.
   */
  disconnect(): Promise<void>;

  /** 
   * Sends a specific command to the adapter and returns the raw string response.
   */
  sendCommand(command: string): Promise<string>;
}
