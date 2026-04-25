import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

export class LeanConditionRule implements DiagnosticRule {
  readonly id = 'lean_condition';

  public evaluate(allFrames: ObdLiveFrame[], recentFrames: ObdLiveFrame[]): DiagnosticResult | null {
    const avgLtft = this.average(recentFrames.map(f => f.ltftB1));
    const avgStft = this.average(recentFrames.map(f => f.stftB1));

    if (avgLtft > 10) {
      return {
        issueId: this.id,
        title: 'Lean condition tendency detected',
        severity: 'warning',
        confidence: Math.min(0.95, 0.5 + (avgLtft / 40)),
        evidence: [`Avg LTFT: ${avgLtft.toFixed(1)}%`, `Avg STFT: ${avgStft.toFixed(1)}%`],
        explanation: 'Engine is running lean. The computer is adding extra fuel to compensate for excess air.',
        recommendedNextStep: 'Inspect for intake leaks or a dirty MAF sensor.',
        createdAt: Date.now()
      };
    }
    return null;
  }

  private average(vals: number[]): number {
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
}
