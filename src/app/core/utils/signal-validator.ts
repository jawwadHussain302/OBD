import { ObdLiveFrame } from '../models/obd-live-frame.model';

/**
 * Utility for validating and smoothing OBD signal data.
 */
export class SignalValidator {

  /**
   * Sanitizes a live frame by clamping all fields to safe ranges and filling
   * in safe defaults for undefined optional fields. This prevents extreme
   * values from distorting charts or triggering false diagnostic alerts.
   */
  public static sanitizeFrame(frame: ObdLiveFrame): ObdLiveFrame {
    const sanitized: ObdLiveFrame = {
      timestamp:        frame.timestamp || Date.now(),
      rpm:              this.validateRpm(frame.rpm),
      speed:            this.clamp(frame.speed, 0, 300, 0),
      engineLoad:       this.validatePercent(frame.engineLoad),
      coolantTemp:      this.validateTemp(frame.coolantTemp),
      intakeAirTemp:    this.validateTemp(frame.intakeAirTemp),
      stftB1:           this.validateFuelTrim(frame.stftB1),
      ltftB1:           this.validateFuelTrim(frame.ltftB1),
      throttlePosition: this.validatePercent(frame.throttlePosition),
    };
    // Preserve optional fields only when present and valid
    if (frame.maf !== undefined)               sanitized.maf               = this.clamp(frame.maf, 0, 655, 0);
    if (frame.map !== undefined)               sanitized.map               = this.clamp(frame.map, 0, 300, 0);
    if (frame.batteryVoltage !== undefined)    sanitized.batteryVoltage    = this.clamp(frame.batteryVoltage, 0, 20, 12);
    if (frame.connectionQuality !== undefined) sanitized.connectionQuality = this.clamp(frame.connectionQuality, 0, 100, 100);
    return sanitized;
  }

  /**
   * Returns a list of human-readable labels for optional PIDs that are missing
   * from the frame, used to surface fallback messaging in the UI.
   */
  public static missingOptionalPids(frame: ObdLiveFrame): string[] {
    const missing: string[] = [];
    if (frame.maf === undefined)            missing.push('MAF');
    if (frame.map === undefined)            missing.push('MAP');
    if (frame.batteryVoltage === undefined) missing.push('Battery Voltage');
    return missing;
  }
  
  /**
   * Clamps a value within a specified range and ensures it's a valid number.
   */
  public static clamp(value: number | undefined | null, min: number, max: number, defaultValue = 0): number {
    if (value === undefined || value === null || isNaN(value)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Simple exponential moving average smoothing.
   * formula: St = α * Yt + (1 - α) * St-1
   */
  public static smooth(currentValue: number, previousValue: number | undefined, alpha = 0.3): number {
    if (previousValue === undefined) {
      return currentValue;
    }
    return alpha * currentValue + (1 - alpha) * previousValue;
  }

  /**
   * Validates a fuel trim value (-100 to 100 %).
   */
  public static validateFuelTrim(value: number | undefined | null): number {
    return this.clamp(value, -100, 100, 0);
  }

  /**
   * Validates an RPM value (0 to 10000).
   */
  public static validateRpm(value: number | undefined | null): number {
    return this.clamp(value, 0, 10000, 0);
  }

  /**
   * Validates a temperature value (-40 to 250 C).
   */
  public static validateTemp(value: number | undefined | null): number {
    return this.clamp(value, -40, 250, 0);
  }

  /**
   * Validates a percentage value (0 to 100).
   */
  public static validatePercent(value: number | undefined | null): number {
    return this.clamp(value, 0, 100, 0);
  }
}
