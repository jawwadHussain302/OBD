/**
 * Represents a single snapshot of real-time vehicle data from the OBD2 adapter.
 */
export interface ObdLiveFrame {
  timestamp: number;
  rpm: number;
  speed: number;
  engineLoad: number;
  coolantTemp: number;
  intakeAirTemp: number;
  stftB1: number;
  ltftB1: number;
  maf?: number;
  map?: number;
  throttlePosition: number;
  batteryVoltage?: number;
  connectionQuality?: number;
}
