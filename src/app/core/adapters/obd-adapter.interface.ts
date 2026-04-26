import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export interface ObdDebugInfo {
  lastFrameTime: number | null;
  pollingHz: number;
  failingPids: Array<{ pid: string; command: string; response: string; timestamp: number }>;
}

/**
 * DI token used to inject whichever ObdAdapter implementation is active.
 * Providers: { provide: OBD_ADAPTER, useClass: WebBluetoothElm327AdapterService }
 *        or: { provide: OBD_ADAPTER, useClass: MockObdAdapterService }
 */
export const OBD_ADAPTER = new InjectionToken<ObdAdapter>('ObdAdapter');

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
   * Diagnostic / debug stream for adapter observability.
   */
  debug$?: Observable<ObdDebugInfo>;

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
