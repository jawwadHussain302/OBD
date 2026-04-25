import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';
import { DiagnosticRule } from './diagnostic-rule.interface';
import { BatteryHealthRule } from './diagnostic-rules/battery-health.rule';
import { IdleStabilityRule } from './diagnostic-rules/idle-stability.rule';
import { LeanConditionRule } from './diagnostic-rules/lean-condition.rule';
import { RichConditionRule } from './diagnostic-rules/rich-condition.rule';
import { VacuumLeakPatternRule } from './diagnostic-rules/vacuum-leak-pattern.rule';
import { WarmupIssueRule } from './diagnostic-rules/warmup-issue.rule';

@Injectable({
  providedIn: 'root'
})
export class DiagnosticEngineService {
  private activeResultsSubject = new BehaviorSubject<DiagnosticResult[]>([]);
  public readonly activeResults$: Observable<DiagnosticResult[]> = this.activeResultsSubject.asObservable();
  
  private rules: DiagnosticRule[] = [];
  private frameBuffer: ObdLiveFrame[] = [];
  private readonly MAX_BUFFER_SIZE = 30;

  constructor() {
    this.initializeRules();
  }

  private initializeRules(): void {
    this.rules = [
      new LeanConditionRule(),
      new RichConditionRule(),
      new VacuumLeakPatternRule(),
      new WarmupIssueRule(),
      new BatteryHealthRule(),
      new IdleStabilityRule()
    ];
  }

  public startSession(): void {
    this.frameBuffer = [];
    this.activeResultsSubject.next([]);
  }

  public processFrame(frame: ObdLiveFrame): void {
    this.frameBuffer.push(frame);
    
    if (this.frameBuffer.length > this.MAX_BUFFER_SIZE) {
      this.frameBuffer.shift();
    }

    this.runRules();
  }

  public stopSession(): void {
    this.activeResultsSubject.next([]);
  }

  private runRules(): void {
    const results: DiagnosticResult[] = [];
    const recentFrames = this.frameBuffer.slice(-15);

    for (const rule of this.rules) {
      const result = rule.evaluate(this.frameBuffer, recentFrames);
      if (result) {
        results.push(result);
      }
    }

    this.activeResultsSubject.next(results);
  }
}
