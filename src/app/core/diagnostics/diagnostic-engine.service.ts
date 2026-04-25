import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';
import { DiagnosticRule } from './diagnostic-rule.interface';
import { LeanConditionRule } from './diagnostic-rules/lean-condition.rule';
import { RichConditionRule } from './diagnostic-rules/rich-condition.rule';
import { WarmupIssueRule } from './diagnostic-rules/warmup-issue.rule';
import { BatteryHealthRule } from './diagnostic-rules/battery-health.rule';
import { IdleStabilityRule } from './diagnostic-rules/idle-stability.rule';
import { VacuumLeakPatternRule } from './diagnostic-rules/vacuum-leak-pattern.rule';

@Injectable({
  providedIn: 'root'
})
export class DiagnosticEngineService {
  private activeResultsSubject = new BehaviorSubject<DiagnosticResult[]>([]);
  public readonly activeResults$ = this.activeResultsSubject.asObservable();

  private rules: DiagnosticRule[] = [
    new LeanConditionRule(),
    new RichConditionRule(),
    new WarmupIssueRule(),
    new VacuumLeakPatternRule(),
    new BatteryHealthRule(),
    new IdleStabilityRule()
  ];

  private frameBuffer: ObdLiveFrame[] = [];
  private sessionStartMs = 0;

  startSession() {
    this.frameBuffer = [];
    this.sessionStartMs = Date.now();
    this.activeResultsSubject.next([]);
  }

  processFrame(frame: ObdLiveFrame) {
    if (this.sessionStartMs === 0) {
      this.sessionStartMs = Date.now();
    }
    
    this.frameBuffer.push(frame);
    
    // Keep max 600 frames (e.g. 1 minute at 10Hz) to prevent memory leak
    if (this.frameBuffer.length > 600) {
      this.frameBuffer.shift();
    }

    const sessionDurationMs = Date.now() - this.sessionStartMs;
    const currentResults: DiagnosticResult[] = [];

    // Evaluate all rules
    for (const rule of this.rules) {
      const result = rule.evaluate(this.frameBuffer, sessionDurationMs);
      if (result) {
        currentResults.push(result);
      }
    }

    this.activeResultsSubject.next(currentResults);
  }

  stopSession() {
    this.frameBuffer = [];
    this.sessionStartMs = 0;
  }
}
