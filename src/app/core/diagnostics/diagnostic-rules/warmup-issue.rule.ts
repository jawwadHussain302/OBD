import { DiagnosticRule } from '../diagnostic-rule.interface';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DiagnosticResult } from '../../models/diagnostic-result.model';

export class WarmupIssueRule implements DiagnosticRule {
  readonly id = 'warmup_issue';

  public evaluate(allFrames: ObdLiveFrame[], recentFrames: ObdLiveFrame[]): DiagnosticResult | null {
    if (allFrames.length < 2) return null;

    const latestFrame = recentFrames[recentFrames.length - 1];
    const firstFrame = allFrames[0];
    const durationMins = (latestFrame.timestamp - firstFrame.timestamp) / 60000;

    // Trigger if coolant stays below 75C after 5 mins
    if (durationMins > 5 && latestFrame.coolantTemp < 75) {
      return {
        issueId: this.id,
        title: 'Engine warm-up issue',
        severity: 'warning',
        confidence: Math.min(0.98, 0.8 + (durationMins / 60)),
        evidence: [`Coolant is ${latestFrame.coolantTemp}C after ${Math.round(durationMins)} mins`],
        explanation: 'Engine fails to reach operating temp. Likely a stuck-open thermostat.',
        recommendedNextStep: 'Inspect the thermostat and coolant levels.',
        createdAt: Date.now()
      };
    }
    return null;
  }
}
