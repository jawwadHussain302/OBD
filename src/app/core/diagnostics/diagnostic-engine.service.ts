import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';
import type { KnowledgePack, StepOption, DiagnosticState, Step } from './diagnostic-types';
import { DiagnosticRule } from './diagnostic-rule.interface';
import { BatteryHealthRule } from './diagnostic-rules/battery-health.rule';
import { IdleStabilityRule } from './diagnostic-rules/idle-stability.rule';
import { LeanConditionRule } from './diagnostic-rules/lean-condition.rule';
import { RichConditionRule } from './diagnostic-rules/rich-condition.rule';
import { VacuumLeakPatternRule } from './diagnostic-rules/vacuum-leak-pattern.rule';
import { WarmupIssueRule } from './diagnostic-rules/warmup-issue.rule';
import { SignalValidator } from '../utils/signal-validator';

@Injectable({
  providedIn: 'root'
})
export class DiagnosticEngineService {
  private diagnosticStateSubject = new BehaviorSubject<DiagnosticState | null>(null);
  public readonly diagnosticState$: Observable<DiagnosticState | null> = this.diagnosticStateSubject.asObservable();
  private currentPack: KnowledgePack | null = null;

  private activeResultsSubject = new BehaviorSubject<DiagnosticResult[]>([]);
  public readonly activeResults$: Observable<DiagnosticResult[]> = this.activeResultsSubject.asObservable();
  
  private rules: DiagnosticRule[] = [];
  private frameBuffer: ObdLiveFrame[] = [];
  private readonly MAX_BUFFER_SIZE = 50;
  private readonly PERSISTENCE_THRESHOLD = 3;
  private persistenceCount = new Map<string, number>();
  private liveSessionStarted = false;

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
    if (this.liveSessionStarted) {
      return;
    }

    this.liveSessionStarted = true;
    this.resetSession();
  }

  public resetSession(): void {
    this.frameBuffer = [];
    this.persistenceCount.clear();
    this.activeResultsSubject.next([]);
  }

  public restoreSession(frames: readonly ObdLiveFrame[]): void {
    this.liveSessionStarted = true;
    this.resetSession();
    frames.slice(-this.MAX_BUFFER_SIZE).forEach(frame => this.processFrame(frame));
  }

  public processFrame(frame: ObdLiveFrame): void {
    this.frameBuffer.push(SignalValidator.sanitizeFrame(frame));

    if (this.frameBuffer.length > this.MAX_BUFFER_SIZE) {
      this.frameBuffer.shift();
    }

    this.runRules();
  }

  public stopSession(): void {
    this.liveSessionStarted = false;
    this.resetSession();
  }

  private runRules(): void {
    const results: DiagnosticResult[] = [];
    const recentFrames = this.frameBuffer.slice(-15);
    const activeIds = new Set<string>();

    for (const rule of this.rules) {
      const result = rule.evaluate(this.frameBuffer, recentFrames);

      if (result) {
        activeIds.add(rule.id);
        const count = (this.persistenceCount.get(rule.id) ?? 0) + 1;
        this.persistenceCount.set(rule.id, count);

        if (count >= this.PERSISTENCE_THRESHOLD) {
          results.push(result);
        }
      }
    }

    for (const id of this.persistenceCount.keys()) {
      if (!activeIds.has(id)) {
        this.persistenceCount.delete(id);
      }
    }

    this.activeResultsSubject.next(results);
  }
// ─── Guided Diagnostic Engine ──────────────────────────────────────────────

  public startPack(pack: KnowledgePack): void {
    this.currentPack = pack;
    const initialScores: Record<string, number> = {};
    pack.hypotheses.forEach(h => {
      initialScores[h.id] = h.initialConfidence;
    });

    const initialState: DiagnosticState = {
      activePackId: pack.id,
      hypothesisScores: initialScores,
      currentStepId: pack.steps.length > 0 ? pack.steps[0].id : '',
      history: []
    };

    this.diagnosticStateSubject.next(initialState);
  }

  public applyAnswer(option: StepOption): void {
    const currentState = this.diagnosticStateSubject.value;
    if (!currentState || !this.currentPack) return;

    // Create a deep copy to avoid mutating the nested hypothesisScores object
    const newState = {
      ...currentState,
      hypothesisScores: { ...currentState.hypothesisScores },
      history: [...currentState.history]
    };

    this.updateHypothesisScores(option.effect, newState);

    // Add to history
    newState.history.push({
      stepId: newState.currentStepId,
      selectedOption: option.label
    });

    // Advance to next step
    if (option.next) {
      newState.currentStepId = option.next;
    } else {
      // Find the current step index and move to the next one in the array
      const currentIndex = this.currentPack.steps.findIndex(s => s.id === newState.currentStepId);
      if (currentIndex !== -1 && currentIndex < this.currentPack.steps.length - 1) {
        newState.currentStepId = this.currentPack.steps[currentIndex + 1].id;
      } else {
         // Pack is complete
         newState.currentStepId = '';
      }
    }

    this.diagnosticStateSubject.next(newState);
  }

  public updateHypothesisScores(effect: Record<string, number>, currentState: DiagnosticState | null = this.diagnosticStateSubject.value): void {
     if (!currentState) return;
     for (const [hypothesisId, scoreChange] of Object.entries(effect)) {
        if (currentState.hypothesisScores[hypothesisId] !== undefined) {
           currentState.hypothesisScores[hypothesisId] += scoreChange;
        }
     }
  }

  public getCurrentStep(): Step | null {
    const currentState = this.diagnosticStateSubject.value;
    if (!currentState || !this.currentPack || !currentState.currentStepId) return null;

    return this.currentPack.steps.find(s => s.id === currentState.currentStepId) || null;
  }

  public getState(): DiagnosticState | null {
    return this.diagnosticStateSubject.value;
  }
}
