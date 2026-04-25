import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

/**
 * IdleStabilityRule
 * 
 * Why this rule exists:
 * Detects engine idle surge or rough idle conditions.
 * 
 * What condition it detects:
 * High variance in RPM while the vehicle is stationary and throttle is closed.
 * 
 * How thresholds were chosen:
 * Normal idle fluctuation is usually < 50 RPM. If speed is 0, throttle is low, 
 * and RPM variance is > 100 RPM over several seconds, the idle is unstable.
 */
export class IdleStabilityRule implements DiagnosticRule {
  id = 'rule_idle_stability';

  evaluate(allFrames: ObdLiveFrame[], _recentFrames: ObdLiveFrame[]): DiagnosticResult | null {
    if (allFrames.length < 50) {
      return null;
    }

    const last50 = allFrames.slice(-50);

    const isIdling = last50.every(f => f.speed === 0 && f.throttlePosition < 5);
    if (!isIdling) {
      return null;
    }

    const rpms = last50.map(f => f.rpm);
    const minRpm = Math.min(...rpms);
    const maxRpm = Math.max(...rpms);
    const rpmVariance = maxRpm - minRpm;

    if (rpmVariance <= 150) {
      return null;
    }

    return {
      issueId: this.id,
      title: 'Idle instability detected',
      severity: 'info',
      confidence: 0.75,
      evidence: [
        `Vehicle is stationary with closed throttle`,
        `RPM fluctuated between ${minRpm.toFixed(0)} and ${maxRpm.toFixed(0)} (variance: ${rpmVariance.toFixed(0)} RPM)`
      ],
      explanation: 'The engine RPM is fluctuating more than expected while idling. This can cause a rough idle or stalling.',
      recommendedNextStep: 'Check for vacuum leaks, clean the Idle Air Control (IAC) valve, and inspect the throttle body.',
      createdAt: Date.now()
    };
  }
}
