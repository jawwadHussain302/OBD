import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

/**
 * WarmupIssueRule
 * 
 * Why this rule exists:
 * Detects if the engine fails to reach normal operating temperature.
 * 
 * What condition it detects:
 * Coolant temperature remains below expected threshold (75°C) after a sufficient warmup period.
 * 
 * How thresholds were chosen:
 * 60 seconds (for testing, normally ~5 mins) and 75°C. A stuck open thermostat 
 * or faulty sensor can cause low readings, preventing closed-loop fuel control.
 */
export class WarmupIssueRule implements DiagnosticRule {
  id = 'rule_warmup_issue';

  evaluate(frames: ObdLiveFrame[], sessionDurationMs: number): DiagnosticResult | null {
    // Need at least 2 minutes (120000 ms) of session to confidently say it's not warming up
    if (sessionDurationMs < 60000 || frames.length < 10) {
      return null;
    }

    const recentFrame = frames[frames.length - 1];

    if (recentFrame.coolantTemp >= 75) {
      return null;
    }

    return {
      issueId: this.id,
      title: 'Engine may not be reaching operating temperature',
      severity: 'warning',
      confidence: 80,
      evidence: [
        `Session time: ${(sessionDurationMs / 1000).toFixed(0)} seconds`,
        `Current coolant temp: ${recentFrame.coolantTemp.toFixed(1)}°C (Expected > 75°C)`
      ],
      explanation: 'Coolant temperature is staying lower than expected. A thermostat stuck open can cause poor fuel economy and incorrect fuel trims.',
      recommendedNextStep: 'Check thermostat operation and compare coolant temperature with actual engine warm-up behavior.',
      createdAt: Date.now()
    };
  }
}
