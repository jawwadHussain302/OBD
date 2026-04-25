import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

/**
 * RichConditionRule
 * 
 * Why this rule exists:
 * Identifies situations where the engine is running rich (too much fuel, not enough air).
 * 
 * What condition it detects:
 * Very low (negative) Long Term Fuel Trim (LTFT).
 * 
 * How thresholds were chosen:
 * < -10% LTFT indicates the ECU is actively reducing fuel to compensate for a rich mixture.
 */
export class RichConditionRule implements DiagnosticRule {
  id = 'rule_rich_condition';

  evaluate(frames: ObdLiveFrame[], sessionDurationMs: number): DiagnosticResult | null {
    if (frames.length < 10) {
      return null;
    }
    
    const recentFrames = frames.slice(-30);
    const avgLtft = this.calculateAverage(recentFrames, 'ltftB1');
    const avgStft = this.calculateAverage(recentFrames, 'stftB1');

    if (avgLtft >= -10) {
      return null;
    }

    return {
      issueId: this.id,
      title: 'Rich condition tendency detected',
      severity: 'warning',
      confidence: 85,
      evidence: [
        `LTFT B1 average is ${avgLtft.toFixed(1)}% (Threshold: < -10%)`,
        `STFT B1 average is ${avgStft.toFixed(1)}%`
      ],
      explanation: 'The ECU appears to be removing fuel because the mixture may be richer than expected.',
      recommendedNextStep: 'Check leaking injectors, high fuel pressure, dirty air filter, faulty MAF/MAP readings, or oxygen sensor behavior.',
      createdAt: Date.now()
    };
  }

  private calculateAverage(frames: ObdLiveFrame[], key: keyof ObdLiveFrame): number {
    return frames.reduce((sum, f) => sum + (f[key] as number), 0) / frames.length;
  }
}
