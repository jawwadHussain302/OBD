import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

/**
 * BatteryHealthRule
 * 
 * Why this rule exists:
 * Detects if the vehicle's charging system (alternator) or battery is failing.
 * 
 * What condition it detects:
 * Battery voltage consistently below 13.0V while engine is running.
 * 
 * How thresholds were chosen:
 * A healthy alternator should produce 13.5V to 14.5V while the engine is running.
 * If RPM > 500 and Voltage < 13.0V consistently, the charging system has an issue.
 */
export class BatteryHealthRule implements DiagnosticRule {
  id = 'rule_battery_health';

  evaluate(frames: ObdLiveFrame[], sessionDurationMs: number): DiagnosticResult | null {
    if (frames.length < 20) {
      return null;
    }

    const recentFrames = frames.slice(-20);
    
    // Check if engine is running
    const isEngineRunning = recentFrames.every(f => f.rpm > 500);
    if (!isEngineRunning) {
      return null;
    }

    const avgVoltage = recentFrames.reduce((sum, f) => sum + (f.batteryVoltage || 14.0), 0) / recentFrames.length;

    if (avgVoltage >= 13.0) {
      return null;
    }

    return {
      issueId: this.id,
      title: 'Charging system voltage low',
      severity: 'critical',
      confidence: 95,
      evidence: [
        `Engine is running (RPM > 500)`,
        `Average Battery Voltage: ${avgVoltage.toFixed(1)}V (Expected > 13.5V)`
      ],
      explanation: 'The vehicle voltage is lower than expected while the engine is running. This indicates the alternator may not be charging the battery properly.',
      recommendedNextStep: 'Check alternator output, battery terminals, and drive belt.',
      createdAt: Date.now()
    };
  }
}
