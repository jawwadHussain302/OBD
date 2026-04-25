import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

/**
 * VacuumLeakPatternRule
 * 
 * Why this rule exists:
 * Detects classic unmetered air leaks (vacuum leaks) that affect idle quality.
 * 
 * What condition it detects:
 * High fuel trims at idle (ECU adding fuel) that normalize when RPM is raised.
 * 
 * How thresholds were chosen:
 * > +15% total trim at idle indicates a problem. < +10% LTFT at >2000 RPM 
 * shows the leak becomes negligible compared to total airflow, a classic signature.
 */
export class VacuumLeakPatternRule implements DiagnosticRule {
  id = 'rule_vacuum_leak_pattern';

  evaluate(frames: ObdLiveFrame[], sessionDurationMs: number): DiagnosticResult | null {
    if (frames.length < 50) {
      return null;
    }

    const idleFrames = frames.filter(f => f.rpm < 1200);
    const revFrames = frames.filter(f => f.rpm > 2000);

    if (idleFrames.length <= 10 || revFrames.length <= 10) {
      return null;
    }

    const avgIdleLtft = this.calculateAverage(idleFrames, 'ltftB1');
    const avgIdleStft = this.calculateAverage(idleFrames, 'stftB1');
    const avgRevLtft = this.calculateAverage(revFrames, 'ltftB1');
    
    const idleTotalTrim = avgIdleLtft + avgIdleStft;

    if (idleTotalTrim <= 15 || avgRevLtft >= 10) {
      return null;
    }

    return {
      issueId: this.id,
      title: 'Vacuum leak pattern likely',
      severity: 'warning',
      confidence: 90,
      evidence: [
        `Idle trims: +${idleTotalTrim.toFixed(1)}%`,
        `Revved trims (LTFT): +${avgRevLtft.toFixed(1)}%`
      ],
      explanation: 'Fuel trims are worse at idle and improve at higher RPM. This pattern often points toward unmetered air entering the engine at idle.',
      recommendedNextStep: 'Inspect vacuum lines, intake boot, PCV valve, brake booster hose, and intake manifold gasket.',
      createdAt: Date.now()
    };
  }

  private calculateAverage(frames: ObdLiveFrame[], key: keyof ObdLiveFrame): number {
    return frames.reduce((sum, f) => sum + (f[key] as number), 0) / frames.length;
  }
}
