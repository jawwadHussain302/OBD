import { Injectable } from '@angular/core';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';

@Injectable({
  providedIn: 'root'
})
export class DiagnosticEngineService {
  constructor() {}

  /**
   * Analyzes a collection of data frames to detect mechanical or sensor issues.
   * @param frames The history of OBD data frames to evaluate.
   */
  public evaluate(frames: ObdLiveFrame[]): DiagnosticResult[] {
    if (frames.length === 0) return [];

    const results: DiagnosticResult[] = [];
    const latestFrame = frames[frames.length - 1];

    // 1. Lean Condition Rule
    // Condition: LTFT > +10 and STFT is positive.
    // Meaning: The computer is adding significant fuel to compensate for too much air.
    if (latestFrame.ltftB1 > 10 && latestFrame.stftB1 > 0) {
      results.push({
        issueId: 'lean_condition',
        title: 'Lean condition tendency detected',
        severity: 'warning',
        confidence: 0.8,
        evidence: [`LTFT is ${latestFrame.ltftB1}%`, `STFT is ${latestFrame.stftB1}%`],
        explanation: 'The engine is running lean (too much air), and the computer is adding extra fuel to compensate.',
        recommendedNextStep: 'Check for vacuum leaks or a failing MAF sensor.',
        createdAt: Date.now()
      });
    }

    // 2. Rich Condition Rule
    // Condition: LTFT < -10.
    // Meaning: The computer is removing significant fuel to compensate for too much fuel.
    if (latestFrame.ltftB1 < -10) {
      results.push({
        issueId: 'rich_condition',
        title: 'Rich condition tendency detected',
        severity: 'warning',
        confidence: 0.8,
        evidence: [`LTFT is ${latestFrame.ltftB1}%`],
        explanation: 'The engine is running rich (too much fuel), and the computer is pulling fuel to compensate.',
        recommendedNextStep: 'Check for leaking injectors or restricted air intake.',
        createdAt: Date.now()
      });
    }

    // 3. Warm-up Issue Rule
    // Condition: Coolant temp < 75C after at least 5 minutes of data.
    // Meaning: Thermostat might be stuck open, preventing engine from reaching operating temp.
    const fiveMinutesInMs = 5 * 60 * 1000;
    const sessionDuration = latestFrame.timestamp - frames[0].timestamp;
    if (sessionDuration > fiveMinutesInMs && latestFrame.coolantTemp < 75) {
      results.push({
        issueId: 'warmup_issue',
        title: 'Engine warm-up issue',
        severity: 'warning',
        confidence: 0.9,
        evidence: [`Coolant temp is ${latestFrame.coolantTemp}C after ${Math.round(sessionDuration / 60000)} mins`],
        explanation: 'The engine has been running for a while but has not reached ideal operating temperature (~90C).',
        recommendedNextStep: 'Inspect the thermostat and coolant levels.',
        createdAt: Date.now()
      });
    }

    // 4. Vacuum Leak Pattern Rule
    // Condition: High positive trims at low RPM (idle), but trims improve (get closer to zero) at high RPM.
    // Meaning: A vacuum leak is most impactful at idle when the throttle is closed.
    const idleFrames = frames.filter(f => f.rpm < 1000);
    const loadFrames = frames.filter(f => f.rpm > 2500);
    
    if (idleFrames.length > 5 && loadFrames.length > 5) {
      const avgIdleTrim = this.average(idleFrames.map(f => f.ltftB1 + f.stftB1));
      const avgLoadTrim = this.average(loadFrames.map(f => f.ltftB1 + f.stftB1));
      
      // If idle trim is high (>15) but improves significantly at load (drops by 10+)
      if (avgIdleTrim > 15 && (avgIdleTrim - avgLoadTrim) > 10) {
        results.push({
          issueId: 'vacuum_leak_pattern',
          title: 'Vacuum leak pattern identified',
          severity: 'critical',
          confidence: 0.85,
          evidence: [`Idle total trim: ${avgIdleTrim.toFixed(1)}%`, `Load total trim: ${avgLoadTrim.toFixed(1)}%`],
          explanation: 'Fuel trims are very high at idle but improve at higher speeds. This is a classic indicator of a vacuum leak.',
          recommendedNextStep: 'Inspect vacuum hoses and intake manifold gaskets.',
          createdAt: Date.now()
        });
      }
    }

    return results;
  }

  private average(vals: number[]): number {
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
}
