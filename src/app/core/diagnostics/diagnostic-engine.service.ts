import { Injectable } from '@angular/core';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';

@Injectable({
  providedIn: 'root'
})
export class DiagnosticEngineService {
  private readonly RECENT_FRAME_COUNT = 15;
  private readonly IDLE_RPM_THRESHOLD = 1000;
  private readonly LOAD_RPM_THRESHOLD = 2000;

  constructor() {}

  /**
   * Main entry point to evaluate the current state of the vehicle.
   */
  public evaluate(allFrames: ObdLiveFrame[]): DiagnosticResult[] {
    if (allFrames.length < 5) return [];

    const recentFrames = allFrames.slice(-this.RECENT_FRAME_COUNT);
    const results: DiagnosticResult[] = [];

    // Run specific diagnostic rules
    this.addIfNotNull(results, this.checkLeanCondition(recentFrames));
    this.addIfNotNull(results, this.checkRichCondition(recentFrames));
    this.addIfNotNull(results, this.checkWarmupIssue(allFrames, recentFrames));
    this.addIfNotNull(results, this.checkVacuumLeak(allFrames));

    return results;
  }

  /**
   * Rule: Lean Condition
   * Checks if the engine is running lean (too much air).
   * Indicator: Consistently high positive fuel trims.
   */
  private checkLeanCondition(frames: ObdLiveFrame[]): DiagnosticResult | null {
    const avgLtft = this.average(frames.map(f => f.ltftB1));
    const avgStft = this.average(frames.map(f => f.stftB1));

    if (avgLtft > 10) {
      return {
        issueId: 'lean_condition',
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

  /**
   * Rule: Rich Condition
   * Checks if the engine is running rich (too much fuel).
   * Indicator: Consistently high negative fuel trims.
   */
  private checkRichCondition(frames: ObdLiveFrame[]): DiagnosticResult | null {
    const avgLtft = this.average(frames.map(f => f.ltftB1));

    if (avgLtft < -10) {
      return {
        issueId: 'rich_condition',
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

  /**
   * Rule: Warm-up Issue
   * Checks if the engine fails to reach operating temperature.
   * Indicator: Coolant temp remains low (<75C) after several minutes.
   */
  private checkWarmupIssue(allFrames: ObdLiveFrame[], recentFrames: ObdLiveFrame[]): DiagnosticResult | null {
    const latestFrame = recentFrames[recentFrames.length - 1];
    const firstFrame = allFrames[0];
    const durationMins = (latestFrame.timestamp - firstFrame.timestamp) / 60000;

    // Trigger after 5 minutes of operation
    if (durationMins > 5 && latestFrame.coolantTemp < 75) {
      return {
        issueId: 'warmup_issue',
        title: 'Engine warm-up issue',
        severity: 'warning',
        confidence: 0.8 + (durationMins / 60),
        evidence: [`Coolant is ${latestFrame.coolantTemp}C after ${Math.round(durationMins)} mins`],
        explanation: 'Engine has not reached normal operating temperature. This usually indicates a stuck-open thermostat.',
        recommendedNextStep: 'Replace the thermostat and check coolant levels.',
        createdAt: Date.now()
      };
    }
    return null;
  }

  /**
   * Rule: Vacuum Leak Pattern
   * Checks for a specific pattern where trims are bad at idle but get better at high RPM.
   * Indicator: (Idle Trim - Load Trim) > 10%
   */
  private checkVacuumLeak(allFrames: ObdLiveFrame[]): DiagnosticResult | null {
    const idleFrames = allFrames.filter(f => f.rpm < this.IDLE_RPM_THRESHOLD).slice(-20);
    const loadFrames = allFrames.filter(f => f.rpm > this.LOAD_RPM_THRESHOLD).slice(-20);

    if (idleFrames.length >= 5 && loadFrames.length >= 5) {
      const avgIdleTotalTrim = this.average(idleFrames.map(f => f.ltftB1 + f.stftB1));
      const avgLoadTotalTrim = this.average(loadFrames.map(f => f.ltftB1 + f.stftB1));
      const trimImprovement = avgIdleTotalTrim - avgLoadTotalTrim;

      if (avgIdleTotalTrim > 12 && trimImprovement > 10) {
        return {
          issueId: 'vacuum_leak_pattern',
          title: 'Vacuum leak pattern identified',
          severity: 'critical',
          confidence: Math.min(0.98, 0.6 + (trimImprovement / 30)),
          evidence: [`Idle trim: ${avgIdleTotalTrim.toFixed(1)}%`, `Load trim: ${avgLoadTotalTrim.toFixed(1)}%`],
          explanation: 'Trims are high at idle but improve as RPM increases. This is a classic vacuum leak signature.',
          recommendedNextStep: 'Perform a smoke test or inspect intake vacuum lines.',
          createdAt: Date.now()
        };
      }
    }
    return null;
  }

  private addIfNotNull(results: DiagnosticResult[], result: DiagnosticResult | null): void {
    if (result) results.push(result);
  }

  private average(vals: number[]): number {
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
}
