/**
 * Utility for validating and smoothing OBD signal data.
 */
export class SignalValidator {
  
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
