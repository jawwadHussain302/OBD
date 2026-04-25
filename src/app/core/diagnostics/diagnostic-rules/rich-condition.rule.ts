import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

export class RichConditionRule implements DiagnosticRule {
  readonly id = 'rich_condition';

  public evaluate(allFrames: ObdLiveFrame[], recentFrames: ObdLiveFrame[]): DiagnosticResult | null {
    const avgLtft = this.average(recentFrames.map(f => f.ltftB1));

    if (avgLtft < -10) {
      return {
        issueId: this.id,
        title: 'Rich condition tendency detected',
        severity: 'warning',
        confidence: Math.min(0.95, 0.5 + (Math.abs(avgLtft) / 40)),
        evidence: [`Avg LTFT: ${avgLtft.toFixed(1)}%`],
        explanation: 'Engine is running rich. The computer is pulling fuel to compensate for excess fuel.',
        recommendedNextStep: 'Check for leaking injectors or high fuel pressure.',
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
