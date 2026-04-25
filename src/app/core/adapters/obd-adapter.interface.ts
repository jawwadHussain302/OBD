import { Observable } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

/**
 * Common interface for all OBD2 hardware adapters (Bluetooth, USB, Mock, etc.).
 * This abstraction allows the application to remain hardware-agnostic.
 */
export interface ObdAdapter {
  /**
   * Stream of real-time vehicle data frames.
   */
  data$: Observable<ObdLiveFrame>;

  /**
   * Current connection state of the hardware adapter.
   */
  connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'>;

  /**
   * Establishes a connection to the OBD2 hardware.
   */
  connect(): Promise<void>;

  /**
   * Terminates the connection to the OBD2 hardware.
   */
  disconnect(): Promise<void>;

  /**
   * Sends a raw AT or PID command to the adapter and returns the response.
   * Useful for configuration or special diagnostic requests.
   */
  sendCommand(command: string): Promise<string>;
}
