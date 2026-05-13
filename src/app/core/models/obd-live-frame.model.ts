/**
 * Represents a single snapshot of real-time vehicle data from the OBD2 adapter.
 */
export interface ObdLiveFrame {
  /** Unix timestamp of when the frame was captured */
  timestamp: number;
  
  /** Engine revolutions per minute */
  rpm: number;
  
  /** Vehicle speed in km/h */
  speed: number;
  
  /** Calculated engine load percentage */
  engineLoad: number;
  
  /** Engine coolant temperature in Celsius */
  coolantTemp: number;
  
  /** Intake air temperature in Celsius */
  intakeAirTemp: number;
  
  /** Short Term Fuel Trim Bank 1 percentage */
  stftB1: number;
  
  /** Long Term Fuel Trim Bank 1 percentage */
  ltftB1: number;
  
  /** Mass Air Flow sensor reading (optional) */
  maf?: number;
  
  /** Manifold Absolute Pressure sensor reading (optional) */
  map?: number;
  
  /** Accelerator pedal / throttle plate position percentage */
  throttlePosition: number;
  
  /** Battery voltage (optional) */
  batteryVoltage?: number;
  
  /** Signal strength or packet success rate (optional) */
  connectionQuality?: number;

  /** O2 Sensor 1 Bank 1 — upstream pre-catalyst voltage in V (0–1.275) */
  o2S1B1?: number;
  /** O2 Sensor 2 Bank 1 — downstream post-catalyst voltage in V (0–1.275) */
  o2S2B1?: number;
  /** O2 Sensor 1 Bank 2 — upstream pre-catalyst voltage in V (0–1.275) */
  o2S1B2?: number;
  /** O2 Sensor 2 Bank 2 — downstream post-catalyst voltage in V (0–1.275) */
  o2S2B2?: number;
}
