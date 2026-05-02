import { Injectable, Inject, OnDestroy } from '@angular/core';
import { Observable, BehaviorSubject, Subject, Subscription, timer, combineLatest, of } from 'rxjs';
import { takeUntil, map, first, tap, takeWhile, delay, catchError, filter, distinctUntilChanged } from 'rxjs/operators';
import { ObdAdapter, OBD_ADAPTER } from '../adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { GuidedTestService, GuidedTestResult } from './guided-test.service';
import { idleStabilityTest } from './guided-tests/idle-stability.test';
import { revTest } from './guided-tests/rev-test.test';
import { warmupTest } from './guided-tests/warmup-test.test';
import { DtcCode } from './dtc/dtc-code.model';
import { DtcCorrelationService } from './intelligence/dtc-correlation.service';
import { SeverityEngineService } from './intelligence/severity-engine.service';
import { DiagnosticRecommendationService } from './intelligence/diagnostic-recommendation.service';
import { DiagnosticSummaryService } from './intelligence/diagnostic-summary.service';
import { DiagnosisTimelineService } from './intelligence/diagnosis-timeline.service';
import { DriveSignatureService } from './intelligence/drive-signature.service';
import { EvidenceGraphService } from './intelligence/evidence-graph.service';
import { RootCauseInferenceService } from './intelligence/root-cause-inference.service';
import { RepairInsightService } from './intelligence/repair-insight.service';
import { TestOrchestratorService } from '../test-orchestrator/test-orchestrator.service';
import { CorrelationFinding, DiagnosisSeverity, DiagnosisRecommendation, DiagnosisSummary, DriveSignature, HypothesisReport, TestOrchestrationPlan, RepairInsightReport, RootCauseCandidate, TimelineEvent } from './intelligence/diagnosis-intelligence.models';
import { DiagnosisDtcCollectorService } from './diagnosis-dtc-collector.service';
import { AppError, ErrorCode } from '../models/error.model';

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
  dtcCodes?: DtcCode[];
  dtcFindings?: string[];
  correlationFindings?: CorrelationFinding[];
  severity?: DiagnosisSeverity;
  recommendations?: DiagnosisRecommendation;
  diagnosisSummary?: DiagnosisSummary;
  timelineEvents?: TimelineEvent[];
  driveSignature?: DriveSignature;
  hypothesisReport?: HypothesisReport;
  rootCauses?: RootCauseCandidate[];
  repairInsights?: RepairInsightReport;
  lastError?: AppError;
  /** True when diagnosis completed with at least one step that could not finish */
  isPartial?: boolean;
  /** Which steps were skipped or incomplete, shown in the report */
  incompleteSteps?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class DeepDiagnosisService implements OnDestroy {
  private readonly stateSubject = new BehaviorSubject<DeepDiagnosisState>(this.getInitialState());
  public readonly state$ = this.stateSubject.asObservable();

  private readonly finalResultSubject = new BehaviorSubject<GuidedTestResult | null>(null);
  public readonly finalResult$ = this.finalResultSubject.asObservable();

  private stopSubject = new Subject<void>();
  private stepSubscription = new Subscription();
  private countdownSubscription?: Subscription;

  private sessionActive = false;
  private nextTargetStep: DiagnosisStepId | null = null;
  private stepRetryMap = new Map<DiagnosisStepId, number>();
  private runGeneration = 0;
  private retryTimeoutId: any = null;

  // Frames collected per step for DTC correlation
  private idleFrames: ObdLiveFrame[] = [];
  private revFrames: ObdLiveFrame[] = [];

  // Orchestration plan set after baseline DTC retrieval
  private orchestrationPlan: TestOrchestrationPlan | null = null;

  constructor(
    @Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter,
    private guidedTestService: GuidedTestService,
    private dtcCollector: DiagnosisDtcCollectorService,
    private dtcCorrelation: DtcCorrelationService,
    private severityEngine: SeverityEngineService,
    private recommendationEngine: DiagnosticRecommendationService,
    private summaryService: DiagnosticSummaryService,
    private timeline: DiagnosisTimelineService,
    private driveSignatureService: DriveSignatureService,
    private evidenceGraphService: EvidenceGraphService,
    private rootCauseInference: RootCauseInferenceService,
    private repairInsightService: RepairInsightService,
    private testOrchestrator: TestOrchestratorService,
  ) {}

  public ngOnDestroy(): void {
    this.stopInternal();
  }

  public startDiagnosis(): void {
    this.stopInternal();
    this.sessionActive = true;
    this.stopSubject = new Subject<void>();
    this.idleFrames = [];
    this.revFrames = [];
    this.stepRetryMap.clear();
    this.orchestrationPlan = null;
    this.finalResultSubject.next(null);
    this.runGeneration++;
    this.timeline.reset();
    this.stateSubject.next(this.getInitialState());

    // Cancel gracefully if the adapter disconnects mid-diagnosis
    this.stepSubscription.add(
      this.obdAdapter.connectionStatus$.pipe(
        distinctUntilChanged(),
        filter(status => status === 'disconnected' || status === 'error'),
        first(),
        takeUntil(this.stopSubject),
      ).subscribe(() => {
        if (this.sessionActive) {
          const currentStep = this.stateSubject.value.currentStep;
          this.aggregatePartialResults(currentStep, 'Adapter disconnected during diagnosis.');
        }
      })
    );

    this.runBaselineScan();
  }

  public cancelDiagnosis(): void {
    this.sessionActive = false;
    this.stopInternal();
    this.finalResultSubject.next(null);
    this.timeline.log('cancelled');
    this.stateSubject.next({
      ...this.getInitialState(),
      status: 'cancelled',
      currentStep: 'cancelled',
      instruction: 'Diagnosis cancelled by user.',
      timelineEvents: this.timeline.getEvents(),
    });
  }

  /** Restores a previously saved completed state for read-only review. */
  public loadHistoryEntry(savedState: DeepDiagnosisState): void {
    this.stopInternal();
    this.sessionActive = false;
    this.stateSubject.next({ ...savedState });
  }

  public moveNow(): void {
    if (!this.sessionActive || this.stateSubject.value.status !== 'transitioning') return;
    this.clearCountdown();
    this.advanceFromTransition();
  }

  public stayOnCurrentStep(): void {
    if (!this.sessionActive || this.stateSubject.value.status !== 'transitioning') return;
    this.clearCountdown();
    const currentStep = this.stateSubject.value.currentStep;
    this.updateState({ status: 'running', transitionCountdown: undefined });
    if (currentStep === 'warmup_monitoring') {
      this.runWarmupMonitoring();
    }
  }

  public completeWithoutDriving(): void {
    if (!this.sessionActive || this.stateSubject.value.currentStep !== 'driving_prompt') return;
    this.aggregateResults();
  }

  // ── Steps ────────────────────────────────────────────────────────────────

  private runBaselineScan(): void {
    if (!this.sessionActive) return;

    this.timeline.log('baseline_scan');
    const generation = this.runGeneration;
    this.updateState({
      status: 'running',
      currentStep: 'baseline_scan',
      instruction: 'Collecting baseline engine data...',
      progress: 0,
      timelineEvents: this.timeline.getEvents(),
    });

    const duration = 10000;
    const startTime = Date.now();
    let latestFrame: ObdLiveFrame | null = null;

    this.stepSubscription.add(
      combineLatest([this.obdAdapter.data$, timer(0, 100)]).pipe(
        takeUntil(this.stopSubject),
        map(([frame]) => {
          latestFrame = frame;
          return Math.min(Math.round(((Date.now() - startTime) / duration) * 100), 100);
        }),
        takeWhile(p => p < 100, true)
      ).subscribe({
        next: progress => this.updateState({ progress }),
        complete: async () => {
          if (!this.sessionActive || this.runGeneration !== generation) return;
          
          try {
            await this.retrieveAndDecodeDtcs();
            if (!this.sessionActive) return;

            const dtcCodes = this.stateSubject.value.dtcCodes ?? [];
            this.orchestrationPlan = this.testOrchestrator.plan(dtcCodes);

            const frameToUse = latestFrame ?? this.makeDefaultFrame();
            if (!latestFrame) {
              this.updateState({
                findings: [...this.stateSubject.value.findings, 'No live data received during baseline scan — proceeding with limited information.'],
              });
            }
            if (this.orchestrationPlan.skipSteps.includes('idle_test')) {
              this.updateState({
                findings: this.orchestrationPlan.priorityReason
                  ? [...this.stateSubject.value.findings, this.orchestrationPlan.priorityReason]
                  : this.stateSubject.value.findings,
              });
              this.runDrivingPrompt();
            } else {
              frameToUse.coolantTemp < 70 ? this.runWarmupMonitoring() : this.runIdleTest();
            }
          } catch (err) {
            this.handleStepFailure('baseline_scan', 'Failed to retrieve vehicle metadata.');
          }
        }
      })
    );
  }

  private runWarmupMonitoring(): void {
    if (!this.sessionActive) return;

    this.timeline.log('warmup_monitoring');
    this.updateState({
      status: 'running',
      currentStep: 'warmup_monitoring',
      instruction: 'Engine is warming up. Keep the vehicle stationary and let it idle.',
      progress: 0,
      timelineEvents: this.timeline.getEvents(),
    });

    const timeoutMs = 60000;
    const startTime = Date.now();
    const collectedFrames: ObdLiveFrame[] = [];

    this.stepSubscription.add(
      this.obdAdapter.data$.pipe(
        takeUntil(this.stopSubject),
        tap(frame => {
          if (!this.sessionActive) return;
          collectedFrames.push(frame);
          const elapsed = Date.now() - startTime;
          this.updateState({ progress: Math.min(Math.round((elapsed / timeoutMs) * 100), 100) });
          
          if (frame.coolantTemp >= 75) {
            this.recordResult(warmupTest.evaluate(collectedFrames));
            const nextStep = !this.orchestrationPlan?.skipSteps.includes('idle_test') ? 'idle_test' : 'driving_prompt';
            this.startTransition('Warm-up complete. Moving to next step...', nextStep);
          } else if (elapsed >= timeoutMs) {
            this.handleStepFailure('warmup_monitoring', 'Engine failed to warm up in time.');
          }
        })
      ).subscribe()
    );
  }

  private runIdleTest(): void {
    if (!this.sessionActive) return;

    this.idleFrames = [];
    this.timeline.log('idle_test');
    this.updateState({
      status: 'running',
      currentStep: 'idle_test',
      instruction: 'Running Idle Stability Test. Please keep engine idling...',
      progress: 0,
      timelineEvents: this.timeline.getEvents(),
    });

    this.guidedTestService.startTest(idleStabilityTest);

    // Collect frames alongside GuidedTestService for DTC correlation
    this.stepSubscription.add(
      this.obdAdapter.data$.pipe(takeUntil(this.stopSubject))
        .subscribe(frame => { if (this.idleFrames.length < 120) this.idleFrames.push(frame); })
    );

    this.stepSubscription.add(
      this.guidedTestService.progress$.pipe(takeUntil(this.stopSubject))
        .subscribe(progress => this.updateState({ progress }))
    );

    this.stepSubscription.add(
      this.guidedTestService.result$.pipe(
        first((res): res is GuidedTestResult => !!res),
        takeUntil(this.stopSubject)
      ).subscribe(result => {
        if (!this.sessionActive) return;
        const s = this.stateSubject.value;
        this.updateState({
          results: [...s.results, result],
          findings: result.status !== 'pass' ? [...s.findings, result.summary] : s.findings
        });

        const summaryLower = result.summary.toLowerCase();
        const abnormalTrims = result.status !== 'pass' && (
          summaryLower.includes('trim') || summaryLower.includes('lean') ||
          summaryLower.includes('rich') || result.details?.some(d => d.toLowerCase().includes('trim'))
        );
        
        this.clearStepSubscriptions();
        
        const forceRev = abnormalTrims || this.orchestrationPlan?.focusArea === 'misfire' || this.orchestrationPlan?.focusArea === 'fuel-trim';
        const skipRev = this.orchestrationPlan?.skipSteps.includes('rev_test');

        if (forceRev && !skipRev) {
          this.runRevTest();
        } else if (skipRev) {
          this.runDrivingPrompt();
        } else {
          this.runDrivingPrompt();
        }
      })
    );
  }

  private runRevTest(): void {
    if (!this.sessionActive) return;

    this.revFrames = [];
    this.timeline.log('rev_test');
    this.updateState({
      status: 'running',
      currentStep: 'rev_test',
      instruction: 'Running Engine Response Test. Gradually rev engine to ~2500 RPM and hold.',
      progress: 0,
      timelineEvents: this.timeline.getEvents(),
    });

    this.guidedTestService.startTest(revTest);

    // Collect frames alongside GuidedTestService for DTC correlation
    this.stepSubscription.add(
      this.obdAdapter.data$.pipe(takeUntil(this.stopSubject))
        .subscribe(frame => { if (this.revFrames.length < 120) this.revFrames.push(frame); })
    );

    this.stepSubscription.add(
      this.guidedTestService.progress$.pipe(takeUntil(this.stopSubject))
        .subscribe(progress => this.updateState({ progress }))
    );

    this.stepSubscription.add(
      this.guidedTestService.result$.pipe(
        first((res): res is GuidedTestResult => !!res),
        takeUntil(this.stopSubject)
      ).subscribe(result => {
        if (!this.sessionActive) return;
        const s = this.stateSubject.value;
        this.updateState({
          results: [...s.results, result],
          findings: result.status !== 'pass' ? [...s.findings, result.summary] : s.findings
        });
        this.clearStepSubscriptions();
        this.runDrivingPrompt();
      })
    );
  }

  private runDrivingPrompt(): void {
    if (!this.sessionActive) return;
    this.timeline.log('driving_prompt');
    this.updateState({
      status: 'running',
      currentStep: 'driving_prompt',
      instruction: 'Driving analysis is optional. It can improve diagnosis under real engine load.',
      progress: 100,
      timelineEvents: this.timeline.getEvents(),
    });
  }

  // ── Step Recovery ────────────────────────────────────────────────────────

  private handleStepFailure(step: DiagnosisStepId, message: string): void {
    const retries = this.stepRetryMap.get(step) ?? 0;
    if (retries < 1) {
      this.stepRetryMap.set(step, retries + 1);
      this.timeline.log('error', `Retrying step ${step}: ${message}`);
      this.clearStepSubscriptions();

      const generation = this.runGeneration;
      this.retryTimeoutId = setTimeout(() => {
        this.retryTimeoutId = null;
        if (!this.sessionActive || this.runGeneration !== generation) return;
        switch (step) {
          case 'baseline_scan': this.runBaselineScan(); break;
          case 'warmup_monitoring': this.runWarmupMonitoring(); break;
          case 'idle_test': this.runIdleTest(); break;
          case 'rev_test': this.runRevTest(); break;
        }
      }, 2000);
    } else {
      const error: AppError = {
        code: ErrorCode.TEST_STEP_TIMEOUT,
        message,
        severity: 'high',
        retryable: false,
        timestamp: Date.now()
      };
      this.updateState({ lastError: error });
      // Produce a partial report with whatever data was collected so far
      this.aggregatePartialResults(step, message);
    }
  }

  // ── DTC retrieval and correlation ────────────────────────────────────────

  private async retrieveAndDecodeDtcs(): Promise<void> {
    try {
      this.updateState({ dtcCodes: await this.dtcCollector.collect() });
    } catch {
      this.updateState({ dtcCodes: [] });
    }
  }

  // ── Result aggregation ───────────────────────────────────────────────────

  private aggregatePartialResults(failedStep: DiagnosisStepId, reason: string): void {
    if (!this.sessionActive) return;

    const state = this.stateSubject.value;
    const dtcCodes = state.dtcCodes ?? [];
    const incompleteSteps = [...(state.incompleteSteps ?? []), failedStep];

    // Run correlation on whatever frames were collected
    const correlationFindings = this.dtcCorrelation.correlate(dtcCodes, this.idleFrames, this.revFrames);
    const dtcFindings = correlationFindings.map(f => f.message);

    const severity = this.severityEngine.score(
      dtcCodes, correlationFindings,
      this.revFrames[this.revFrames.length - 1] ?? this.idleFrames[this.idleFrames.length - 1] ?? null
    );
    const recommendations = this.recommendationEngine.recommend(dtcCodes, correlationFindings, severity.level);
    const diagnosisSummary = this.summaryService.generate(correlationFindings, severity);

    const dtcCount = dtcCodes.length;
    const summary = `Partial diagnosis — step "${failedStep}" could not complete. ${dtcCount > 0 ? `${dtcCount} fault code${dtcCount !== 1 ? 's' : ''} detected.` : 'No fault codes detected.'}`;

    const finalResult: GuidedTestResult = {
      status: dtcCount > 0 || state.results.some(r => r.status === 'fail') ? 'fail'
            : state.results.some(r => r.status === 'warning') ? 'warning' : 'warning',
      summary,
      details: [...state.findings, ...dtcFindings, `Incomplete: ${reason}`],
      confidence: 0.5
    };

    this.timeline.log('error', `Partial: ${reason}`);
    const timelineEvents = this.timeline.getEvents();
    this.finalResultSubject.next(finalResult);
    this.updateState({
      status: 'completed',
      dtcFindings,
      correlationFindings,
      severity,
      recommendations,
      diagnosisSummary,
      timelineEvents,
      isPartial: true,
      incompleteSteps,
    });
    this.sessionActive = false;
  }

  private aggregateResults(): void {
    if (!this.sessionActive) return;

    const state = this.stateSubject.value;
    const dtcCodes = state.dtcCodes ?? [];

    const correlationFindings = this.dtcCorrelation.correlate(dtcCodes, this.idleFrames, this.revFrames);
    const dtcFindings = correlationFindings.map(f => f.message);
    
    const driveSignature = this.driveSignatureService.extract(this.idleFrames, this.revFrames);
    const severity = this.severityEngine.score(dtcCodes, correlationFindings, this.revFrames[this.revFrames.length-1] || this.idleFrames[this.idleFrames.length-1]);
    const recommendations = this.recommendationEngine.recommend(dtcCodes, correlationFindings, severity.level);
    const diagnosisSummary = this.summaryService.generate(correlationFindings, severity);

    const evidenceGraph  = this.evidenceGraphService.buildGraph(dtcCodes, this.idleFrames, this.revFrames, driveSignature);
    const contradictions = this.evidenceGraphService.detectContradictions(dtcCodes, this.idleFrames);
    const hypotheses     = this.evidenceGraphService.rankHypotheses(evidenceGraph);
    const hypothesisReport = this.evidenceGraphService.generateReport(hypotheses, contradictions);
    
    const rootCauses    = this.rootCauseInference.infer(dtcCodes, correlationFindings, severity, driveSignature);
    const repairInsights = this.repairInsightService.generate(dtcCodes, rootCauses, severity);

    let finalStatus: 'pass' | 'warning' | 'fail' = 'pass';
    if (state.results.some(r => r.status === 'fail') || dtcCodes.length > 0) {
      finalStatus = 'fail';
    } else if (state.results.some(r => r.status === 'warning') || correlationFindings.length > 0) {
      finalStatus = 'warning';
    }

    const dtcCount = dtcCodes.length;
    const summary = dtcCount > 0
      ? `Full engine diagnosis completed. ${dtcCount} fault code${dtcCount !== 1 ? 's' : ''} detected.`
      : 'Full engine diagnosis completed. No fault codes detected.';

    const finalResult: GuidedTestResult = {
      status: finalStatus,
      summary,
      details: [...state.findings, ...dtcFindings],
      confidence: 0.9
    };

    this.timeline.log('completed');
    const timelineEvents = this.timeline.getEvents();
    this.finalResultSubject.next(finalResult);
    this.updateState({ status: 'completed', dtcFindings, correlationFindings, severity, recommendations, diagnosisSummary, timelineEvents, driveSignature, hypothesisReport, rootCauses, repairInsights });
    this.sessionActive = false;
  }

  // ── Transition ───────────────────────────────────────────────────────────

  private startTransition(instruction: string, nextStep: DiagnosisStepId): void {
    if (!this.sessionActive) return;
    this.stopInternal();
    this.nextTargetStep = nextStep;
    this.updateState({ status: 'transitioning', instruction, transitionCountdown: 3 });

    this.countdownSubscription = timer(1000, 1000).pipe(
      takeUntil(this.stopSubject),
      map(count => 2 - count),
      takeWhile(count => count >= 0, true)
    ).subscribe({
      next: count => {
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
    if (target === 'idle_test')           this.runIdleTest();
    else if (target === 'rev_test')       this.runRevTest();
    else if (target === 'driving_prompt') this.runDrivingPrompt();
    else                                  this.aggregateResults();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private handleError(message: string): void {
    this.timeline.log('error', message);
    this.updateState({ status: 'error', instruction: message, timelineEvents: this.timeline.getEvents() });
    this.sessionActive = false;
  }

  private updateState(patch: Partial<DeepDiagnosisState>): void {
    this.stateSubject.next({ ...this.stateSubject.value, ...patch });
  }

  private recordResult(result: GuidedTestResult): void {
    const s = this.stateSubject.value;
    this.updateState({
      results: [...s.results, result],
      findings: result.status !== 'pass' ? [...s.findings, result.summary] : s.findings
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
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
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
      results: [],
      dtcCodes: [],
      dtcFindings: [],
      isPartial: false,
      incompleteSteps: [],
    };
  }

  private makeDefaultFrame(): ObdLiveFrame {
    return {
      timestamp: Date.now(),
      rpm: 0,
      speed: 0,
      engineLoad: 0,
      coolantTemp: 20,
      intakeAirTemp: 20,
      stftB1: 0,
      ltftB1: 0,
      throttlePosition: 0,
    };
  }
}
