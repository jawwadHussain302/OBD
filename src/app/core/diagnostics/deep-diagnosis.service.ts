import { Injectable, Inject } from '@angular/core';
import { Observable, BehaviorSubject, Subject, Subscription, timer, combineLatest } from 'rxjs';
import { takeUntil, map, first, tap, takeWhile } from 'rxjs/operators';
import { ObdAdapter, OBD_ADAPTER } from '../adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { GuidedTestService, GuidedTestResult } from './guided-test.service';
import { idleStabilityTest } from './guided-tests/idle-stability.test';
import { revTest } from './guided-tests/rev-test.test';
import { warmupTest } from './guided-tests/warmup-test.test';

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
  private stepSubscription = new Subscription();
  private countdownSubscription?: Subscription;
  
  private sessionActive = false;
  private nextTargetStep: DiagnosisStepId | null = null;

  constructor(
    @Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter,
    private guidedTestService: GuidedTestService
  ) {}

  public startDiagnosis(): void {
    this.cancelDiagnosis(); // Cleanup previous runs
    this.sessionActive = true;
    this.stopSubject = new Subject<void>();
    this.runBaselineScan();
  }

  public cancelDiagnosis(): void {
    this.sessionActive = false;
    this.stopInternal();
    this.stateSubject.next({
      ...this.getInitialState(),
      status: 'cancelled',
      currentStep: 'cancelled',
      instruction: 'Diagnosis cancelled by user.'
    });
  }

  public moveNow(): void {
    if (!this.sessionActive || this.stateSubject.value.status !== 'transitioning') {
      return;
    }
    this.clearCountdown();
    this.advanceFromTransition();
  }

  public stayOnCurrentStep(): void {
    if (!this.sessionActive || this.stateSubject.value.status !== 'transitioning') {
      return;
    }
    this.clearCountdown();
    const currentStep = this.stateSubject.value.currentStep;
    
    // Go back to monitoring state instead of transitioning
    this.updateState({
      status: 'running',
      transitionCountdown: undefined
    });

    // Resume monitoring logic based on step
    if (currentStep === 'warmup_monitoring') {
      this.runWarmupMonitoring();
    }
  }

  public completeWithoutDriving(): void {
    if (!this.sessionActive || this.stateSubject.value.currentStep !== 'driving_prompt') {
      return;
    }
    this.aggregateResults();
  }

  private runBaselineScan(): void {
    if (!this.sessionActive) return;

    this.updateState({
      status: 'running',
      currentStep: 'baseline_scan',
      instruction: 'Collecting baseline engine data...',
      progress: 0
    });

    const duration = 10000;
    const startTime = Date.now();
    let latestFrame: ObdLiveFrame | null = null;

    this.stepSubscription.add(
      combineLatest([
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
          if (!this.sessionActive) return;
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
      })
    );
  }

  private runWarmupMonitoring(): void {
    if (!this.sessionActive) return;

    this.updateState({
      status: 'running',
      currentStep: 'warmup_monitoring',
      instruction: 'Engine is warming up. Keep the vehicle stationary and let it idle.',
      progress: 0
    });

    const timeoutMs = 300000; // 5 minute timeout
    const startTime = Date.now();
    const collectedFrames: ObdLiveFrame[] = [];

    this.stepSubscription.add(
      this.obdAdapter.data$.pipe(
        takeUntil(this.stopSubject),
        tap(frame => {
          if (!this.sessionActive) return;

          collectedFrames.push(frame);
          const elapsed = Date.now() - startTime;
          const progress = Math.min(Math.round((elapsed / timeoutMs) * 100), 100);
          
          const isWarm = frame.coolantTemp >= 75;
          const isTimeout = elapsed >= timeoutMs;

          this.updateState({ progress });

          if (isWarm || isTimeout) {
            this.recordResult(warmupTest.evaluate(collectedFrames));
            this.startTransition('Warm-up complete. Moving to Idle Test...', 'idle_test');
          }
        })
      ).subscribe()
    );
  }

  private runIdleTest(): void {
    if (!this.sessionActive) return;

    this.updateState({
      status: 'running',
      currentStep: 'idle_test',
      instruction: 'Running Idle Stability Test. Please keep engine idling...',
      progress: 0
    });

    this.guidedTestService.startTest(idleStabilityTest);

    // Track progress
    this.stepSubscription.add(
      this.guidedTestService.progress$.pipe(
        takeUntil(this.stopSubject)
      ).subscribe(progress => this.updateState({ progress }))
    );

    // Track result exactly once
    this.stepSubscription.add(
      this.guidedTestService.result$.pipe(
        first((res): res is GuidedTestResult => !!res),
        takeUntil(this.stopSubject)
      ).subscribe(result => {
        if (!this.sessionActive) return;

        const currentState = this.stateSubject.value;
        this.updateState({
          results: [...currentState.results, result],
          findings: result.status !== 'pass' ? [...currentState.findings, result.summary] : currentState.findings
        });

        // Branching logic: if fuel trims are mentioned as problematic, move to rev test
        const summaryLower = result.summary.toLowerCase();
        const abnormalTrims = result.status !== 'pass' && (
          summaryLower.includes('trim') || 
          summaryLower.includes('lean') || 
          summaryLower.includes('rich') ||
          result.details?.some(d => d.toLowerCase().includes('trim'))
        );
        
        if (abnormalTrims) {
          this.clearStepSubscriptions();
          this.runRevTest();
        } else {
          this.clearStepSubscriptions();
          this.runDrivingPrompt();
        }
      })
    );
  }

  private runRevTest(): void {
    if (!this.sessionActive) return;

    this.updateState({
      status: 'running',
      currentStep: 'rev_test',
      instruction: 'Running Engine Response Test. Gradually rev engine to ~2500 RPM and hold.',
      progress: 0
    });

    this.guidedTestService.startTest(revTest);

    this.stepSubscription.add(
      this.guidedTestService.progress$.pipe(
        takeUntil(this.stopSubject)
      ).subscribe(progress => this.updateState({ progress }))
    );

    this.stepSubscription.add(
      this.guidedTestService.result$.pipe(
        first((res): res is GuidedTestResult => !!res),
        takeUntil(this.stopSubject)
      ).subscribe(result => {
        if (!this.sessionActive) return;

        const currentState = this.stateSubject.value;
        this.updateState({
          results: [...currentState.results, result],
          findings: result.status !== 'pass' ? [...currentState.findings, result.summary] : currentState.findings
        });
        this.clearStepSubscriptions();
        this.runDrivingPrompt();
      })
    );
  }

  private runDrivingPrompt(): void {
    if (!this.sessionActive) return;

    this.updateState({
      status: 'running', // Stay in running status so UI shows the prompt
      currentStep: 'driving_prompt',
      instruction: 'Driving analysis is optional. It can improve diagnosis under real engine load.',
      progress: 100
    });
  }

  private startTransition(instruction: string, nextStep: DiagnosisStepId): void {
    if (!this.sessionActive) return;

    this.stopInternal(); // stop current step monitoring
    this.nextTargetStep = nextStep;

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
        if (!this.sessionActive) return;
        if (count >= 0) {
          this.updateState({ transitionCountdown: count });
        } else {
          this.advanceFromTransition();
        }
      }
    });
  }

  private advanceFromTransition(): void {
    if (!this.sessionActive) return;

    const target = this.nextTargetStep;
    this.nextTargetStep = null;

    if (target === 'idle_test') {
      this.runIdleTest();
    } else if (target === 'rev_test') {
      this.runRevTest();
    } else if (target === 'driving_prompt') {
      this.runDrivingPrompt();
    } else {
      this.aggregateResults();
    }
  }

  private aggregateResults(): void {
    if (!this.sessionActive) return;

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
    this.sessionActive = false;
  }

  private handleError(message: string): void {
    this.updateState({
      status: 'error',
      instruction: message
    });
    this.sessionActive = false;
  }

  private updateState(patch: Partial<DeepDiagnosisState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...patch
    });
  }

  private recordResult(result: GuidedTestResult): void {
    const currentState = this.stateSubject.value;
    this.updateState({
      results: [...currentState.results, result],
      findings: result.status !== 'pass' ? [...currentState.findings, result.summary] : currentState.findings
    });
  }

  private clearStepSubscriptions(): void {
    this.stepSubscription.unsubscribe();
    this.stepSubscription = new Subscription();
  }

  private stopInternal(): void {
    this.stopSubject.next();
    this.clearStepSubscriptions();
    
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
