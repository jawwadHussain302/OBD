/**
 * Unified error model for the application.
 */
export interface AppError {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
  timestamp: number;
  details?: any;
}

/**
 * Standard error codes for the application.
 */
export enum ErrorCode {
  ADAPTER_NOT_FOUND = 'ADAPTER_NOT_FOUND',
  ADAPTER_CONNECTION_FAILED = 'ADAPTER_CONNECTION_FAILED',
  ADAPTER_DISCONNECTED = 'ADAPTER_DISCONNECTED',
  BLE_NOT_AVAILABLE = 'BLE_NOT_AVAILABLE',
  ELM327_INIT_FAILED = 'ELM327_INIT_FAILED',
  PID_POLL_TIMEOUT = 'PID_POLL_TIMEOUT',
  TEST_STEP_TIMEOUT = 'TEST_STEP_TIMEOUT',
  UNEXPECTED_RESPONSE = 'UNEXPECTED_RESPONSE',
}
