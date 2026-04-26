import { Injectable, Inject } from '@angular/core';
import { Observable, BehaviorSubject, Subject, Subscription, timer, combineLatest, of } from 'rxjs';
import { takeUntil, map, first, finalize, tap, takeWhile, switchMap } from 'rxjs/operators';
import { ObdAdapter, OBD_ADAPTER } from '../adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { GuidedTestService, GuidedTestResult } from './guided-test.service';
import { idleStabilityTest } from './guided-tests/idle-stability.test';
import { revTest } from './guided-tests/rev-test.test';

export type DiagnosisStepId = 
  | 'baseline_scan'
  | 'warmup_monitoring'
  | 'idle_test'
  | 'rev_test'
  | 'driving_prompt'
  | 'driving_analysis'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface DeepDiagnosisState {
  status: 'idle' | 'running' | 'transitioning' | 'completed' | 'cancelled' | 'error';
  currentStep: DiagnosisStepId;
  instruction: string;
  progress: number;
  transitionCountdown?: number;
  findings: string[];
  results: GuidedTestResult[];
}

@Injectable({
  providedIn: 'root'
})
export class DeepDiagnosisService {
  private readonly stateSubject = new BehaviorSubject<DeepDiagnosisState>(this.getInitialState());
  public readonly state$ = this.stateSubject.asObservable();

  private readonly finalResultSubject = new BehaviorSubject<GuidedTestResult | null>(null);
  public readonly finalResult$ = this.finalResultSubject.asObservable();

  private stopSubject = new Subject<void>();
  private stepSubscription?: Subscription;
  private countdownSubscription?: Subscription;

  constructor(
    @Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter,
    private guidedTestService: GuidedTestService
  ) {}

  public startDiagnosis(): void {
    this.cancelDiagnosis(); // Cleanup previous runs
    this.stopSubject = new Subject<void>();
    this.runBaselineScan();
  }

  public cancelDiagnosis(): void {
    this.stopInternal();
    this.stateSubject.next({
      ...this.getInitialState(),
      status: 'cancelled',
      currentStep: 'cancelled',
      instruction: 'Diagnosis cancelled by user.'
    });
  }

  public moveNow(): void {
    if (this.stateSubject.value.status === 'transitioning') {
      this.clearCountdown();
      this.advanceFromTransition();
    }
  }

  public stayOnCurrentStep(): void {
    if (this.stateSubject.value.status === 'transitioning') {
      this.clearCountdown();
      const currentStep = this.stateSubject.value.currentStep;
      
      // Go back to monitoring state instead of transitioning
      this.stateSubject.next({
        ...this.stateSubject.value,
        status: 'running',
        transitionCountdown: undefined
      });

      // Resume monitoring logic based on step
      if (currentStep === 'warmup_monitoring') {
        this.runWarmupMonitoring(true); // resume but maybe with different flags
      }
    }
  }

  private runBaselineScan(): void {
    this.updateState({
      status: 'running',
      currentStep: 'baseline_scan',
      instruction: 'Collecting baseline engine data...',
      progress: 0
    });

    const duration = 10000;
    const startTime = Date.now();
    let latestFrame: ObdLiveFrame | null = null;

    this.stepSubscription = combineLatest([
      this.obdAdapter.data$,
      timer(0, 100)
    ]).pipe(
      takeUntil(this.stopSubject),
      map(([frame]) => {
        latestFrame = frame;
        const elapsed = Date.now() - startTime;
        return Math.min(Math.round((elapsed / duration) * 100), 100);
      }),
      takeWhile(progress => progress < 100, true)
    ).subscribe({
      next: (progress) => this.updateState({ progress }),
      complete: () => {
        if (latestFrame) {
          if (latestFrame.coolantTemp < 70) {
            this.runWarmupMonitoring();
          } else {
            this.runIdleTest();
          }
        } else {
          this.handleError('No data received during baseline scan.');
        }
      }
    });
  }

  private runWarmupMonitoring(isResume = false): void {
    this.updateState({
      status: 'running',
      currentStep: 'warmup_monitoring',
      instruction: 'Engine is warming up. Keep the vehicle stationary and let it idle.',
      progress: 0
    });

    const timeoutMs = 300000; // 5 minute timeout
    const startTime = Date.now();
    const rpmBuffer: number[] = [];

    this.stepSubscription = this.obdAdapter.data$.pipe(
      takeUntil(this.stopSubject),
      tap(frame => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(Math.round((elapsed / timeoutMs) * 100), 100);
        
        // Track RPM stability (last 5 frames)
        rpmBuffer.push(frame.rpm);
        if (rpmBuffer.length > 5) rpmBuffer.shift();
        const isRpmStable = rpmBuffer.length === 5 && this.isStable(rpmBuffer, 50);

        const isWarm = frame.coolantTemp >= 75;
        const isTimeout = elapsed >= timeoutMs;

        this.updateState({ progress });

        if (isWarm || isRpmStable || isTimeout) {
          this.startTransition('Warm-up complete. Moving to Idle Test...', 'idle_test');
        }
      })
    ).subscribe();
  }

  private runIdleTest(): void {
    this.updateState({
      status: 'running',
      currentStep: 'idle_test',
      instruction: 'Running Idle Stability Test. Please keep engine idling...',
      progress: 0
    });

    this.guidedTestService.startTest(idleStabilityTest);

    this.stepSubscription = combineLatest([
      this.guidedTestService.progress$,
      this.guidedTestService.result$
    ]).pipe(
      takeUntil(this.stopSubject),
      tap(([progress, result]) => {
        this.updateState({ progress });
        if (result) {
          const currentState = this.stateSubject.value;
          this.updateState({
            results: [...currentState.results, result],
            findings: result.status !== 'pass' ? [...currentState.findings, result.summary] : currentState.findings
          });

          // Branching logic: if fuel trims are mentioned as problematic, we need to see how they behave under load
          const summaryLower = result.summary.toLowerCase();
          const abnormalTrims = result.status !== 'pass' && (
            summaryLower.includes('trim') || 
            summaryLower.includes('lean') || 
            summaryLower.includes('rich') ||
            result.details?.some(d => d.toLowerCase().includes('trim'))
          );
          
          if (abnormalTrims) {
            this.runRevTest();
          } else {
            this.runDrivingPrompt();
          }
        }
      })
    ).subscribe();
  }

  private runRevTest(): void {
    this.updateState({
      status: 'running',
      currentStep: 'rev_test',
      instruction: 'Running Engine Response Test. Gradually rev engine to ~2500 RPM and hold.',
      progress: 0
    });

    this.guidedTestService.startTest(revTest);

    this.stepSubscription = combineLatest([
      this.guidedTestService.progress$,
      this.guidedTestService.result$
    ]).pipe(
      takeUntil(this.stopSubject),
      tap(([progress, result]) => {
        this.updateState({ progress });
        if (result) {
          const currentState = this.stateSubject.value;
          this.updateState({
            results: [...currentState.results, result],
            findings: result.status !== 'pass' ? [...currentState.findings, result.summary] : currentState.findings
          });
          this.runDrivingPrompt();
        }
      })
    ).subscribe();
  }

  private runDrivingPrompt(): void {
    this.updateState({
      status: 'completed',
      currentStep: 'driving_prompt',
      instruction: 'Driving analysis is optional. It can improve diagnosis under real engine load.',
      progress: 100
    });
    this.aggregateResults();
  }

  private startTransition(instruction: string, nextStep: DiagnosisStepId): void {
    this.stopInternal(); // stop monitoring
    this.updateState({
      status: 'transitioning',
      instruction,
      transitionCountdown: 3
    });

    this.countdownSubscription = timer(1000, 1000).pipe(
      takeUntil(this.stopSubject),
      map(count => 2 - count),
      takeWhile(count => count >= 0, true)
    ).subscribe({
      next: (count) => {
        if (count >= 0) {
          this.updateState({ transitionCountdown: count });
        } else {
          this.advanceFromTransition();
        }
      }
    });
  }

  private advanceFromTransition(): void {
    const nextStep = this.stateSubject.value.currentStep === 'warmup_monitoring' ? 'idle_test' : 'completed';
    if (nextStep === 'idle_test') {
      this.runIdleTest();
    } else {
      this.aggregateResults();
    }
  }

  private aggregateResults(): void {
    const state = this.stateSubject.value;
    const results = state.results;

    let finalStatus: 'pass' | 'warning' | 'fail' = 'pass';
    if (results.some(r => r.status === 'fail')) {
      finalStatus = 'fail';
    } else if (results.some(r => r.status === 'warning')) {
      finalStatus = 'warning';
    }

    const finalResult: GuidedTestResult = {
      status: finalStatus,
      summary: 'Full engine diagnosis completed.',
      details: state.findings,
      confidence: 0.9
    };

    this.finalResultSubject.next(finalResult);
    this.updateState({ status: 'completed' });
  }

  private handleError(message: string): void {
    this.updateState({
      status: 'error',
      instruction: message
    });
  }

  private updateState(patch: Partial<DeepDiagnosisState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...patch
    });
  }

  private stopInternal(): void {
    this.stopSubject.next();
    if (this.stepSubscription) {
      this.stepSubscription.unsubscribe();
      this.stepSubscription = undefined;
    }
    this.clearCountdown();
    this.guidedTestService.stopTest();
  }

  private clearCountdown(): void {
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
      this.countdownSubscription = undefined;
    }
    this.updateState({ transitionCountdown: undefined });
  }

  private isStable(values: number[], threshold: number): boolean {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return (max - min) <= threshold;
  }

  private getInitialState(): DeepDiagnosisState {
    return {
      status: 'idle',
      currentStep: 'baseline_scan',
      instruction: 'Press start to begin diagnosis.',
      progress: 0,
      findings: [],
      results: []
    };
  }
}
