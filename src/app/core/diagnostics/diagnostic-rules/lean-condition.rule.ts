import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

/**
 * LeanConditionRule
 * 
 * Why this rule exists:
 * Identifies situations where the engine is running lean (too much air, not enough fuel).
 * 
 * What condition it detects:
 * High Long Term Fuel Trim (LTFT) combined with positive Short Term Fuel Trim (STFT).
 * 
 * How thresholds were chosen:
 * > +10% LTFT is generally considered the threshold where the ECU is actively 
 * compensating for a significant lean condition. A positive STFT confirms the 
 * condition is still present and not yet fully compensated.
 */
export class LeanConditionRule implements DiagnosticRule {
  id = 'rule_lean_condition';

  evaluate(frames: ObdLiveFrame[], sessionDurationMs: number): DiagnosticResult | null {
    if (frames.length < 10) {
      return null;
    }
    
    const recentFrames = frames.slice(-30);
    const avgLtft = this.calculateAverage(recentFrames, 'ltftB1');
    const avgStft = this.calculateAverage(recentFrames, 'stftB1');

    if (avgLtft <= 10 || avgStft <= 0) {
      return null;
    }

    return {
      issueId: this.id,
      title: 'Lean condition tendency detected',
      severity: 'warning',
      confidence: 85,
      evidence: [
        `LTFT B1 average is +${avgLtft.toFixed(1)}% (Threshold: > +10%)`,
        `STFT B1 average is +${avgStft.toFixed(1)}% (Positive tendency)`
      ],
      explanation: 'The ECU appears to be adding fuel to compensate for a lean mixture. This can happen when extra air enters the engine or fuel delivery is weak.',
      recommendedNextStep: 'Check intake leaks, vacuum hoses, PCV system, MAF sensor cleanliness, and fuel pressure.',
      createdAt: Date.now()
    };
  }

  private calculateAverage(frames: ObdLiveFrame[], key: keyof ObdLiveFrame): number {
    return frames.reduce((sum, f) => sum + (f[key] as number), 0) / frames.length;
  }
}
