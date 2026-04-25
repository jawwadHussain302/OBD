import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

export class VacuumLeakPatternRule implements DiagnosticRule {
  readonly id = 'vacuum_leak_pattern';
  private readonly IDLE_RPM = 1000;
  private readonly LOAD_RPM = 2000;

  public evaluate(allFrames: ObdLiveFrame[], recentFrames: ObdLiveFrame[]): DiagnosticResult | null {
    const idleFrames = allFrames.filter(f => f.rpm < this.IDLE_RPM).slice(-20);
    const loadFrames = allFrames.filter(f => f.rpm > this.LOAD_RPM).slice(-20);

    if (idleFrames.length >= 5 && loadFrames.length >= 5) {
      const avgIdleTrim = this.average(idleFrames.map(f => f.ltftB1 + f.stftB1));
      const avgLoadTrim = this.average(loadFrames.map(f => f.ltftB1 + f.stftB1));
      const trimImprovement = avgIdleTrim - avgLoadTrim;

      if (avgIdleTrim > 12 && trimImprovement > 10) {
        return {
          issueId: this.id,
          title: 'Vacuum leak pattern identified',
          severity: 'critical',
          confidence: Math.min(0.98, 0.6 + (trimImprovement / 30)),
          evidence: [`Idle: ${avgIdleTrim.toFixed(1)}%`, `Load: ${avgLoadTrim.toFixed(1)}%`],
          explanation: 'Trims are high at idle but improve at speed. Signature of a vacuum leak.',
          recommendedNextStep: 'Check vacuum lines and intake gaskets.',
          createdAt: Date.now()
        };
      }
    }
    return null;
  }

  private average(vals: number[]): number {
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
}
