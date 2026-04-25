import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';
import { DiagnosticRule } from './diagnostic-rule.interface';
import { LeanConditionRule } from './diagnostic-rules/lean-condition.rule';
import { RichConditionRule } from './diagnostic-rules/rich-condition.rule';
import { WarmupIssueRule } from './diagnostic-rules/warmup-issue.rule';
import { VacuumLeakPatternRule } from './diagnostic-rules/vacuum-leak-pattern.rule';

@Injectable({
  providedIn: 'root'
})
export class DiagnosticEngineService {
  private readonly RECENT_WINDOW = 15;
  private frames: ObdLiveFrame[] = [];
  
  private rules: DiagnosticRule[] = [
    new LeanConditionRule(),
    new RichConditionRule(),
    new WarmupIssueRule(),
    new VacuumLeakPatternRule()
  ];

  private activeResultsSubject = new BehaviorSubject<DiagnosticResult[]>([]);
  public activeResults$: Observable<DiagnosticResult[]> = this.activeResultsSubject.asObservable();

  constructor() {}

  /**
   * Resets the engine state for a new diagnostic session.
   */
  public startSession(): void {
    this.frames = [];
    this.activeResultsSubject.next([]);
  }

  /**
   * Processes a new frame and triggers an evaluation of all rules.
   */
  public processFrame(frame: ObdLiveFrame): void {
    this.frames.push(frame);
    this.runEvaluation();
  }

  /**
   * Cleans up the current session.
   */
  public stopSession(): void {
    this.frames = [];
  }

  /**
   * Runs all registered rules against the current frame buffer.
   */
  private runEvaluation(): void {
    if (this.frames.length < 5) return;

    const recentFrames = this.frames.slice(-this.RECENT_WINDOW);
    const newResults: DiagnosticResult[] = [];

    for (const rule of this.rules) {
      const result = rule.evaluate(this.frames, recentFrames);
      if (result) {
        newResults.push(result);
      }
    }

    // Only update if results have changed (simple shallow check)
    if (JSON.stringify(newResults) !== JSON.stringify(this.activeResultsSubject.value)) {
      this.activeResultsSubject.next(newResults);
    }
  }
}
