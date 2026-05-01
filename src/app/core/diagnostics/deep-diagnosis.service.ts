import { Injectable, Inject } from '@angular/core';
import { Observable, BehaviorSubject, Subject, Subscription, timer, combineLatest, of, firstValueFrom } from 'rxjs';
import { takeUntil, map, first, tap, takeWhile, take } from 'rxjs/operators';
import { ObdAdapter, OBD_ADAPTER } from '../adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { GuidedTestService, GuidedTestResult } from './guided-test.service';
import { idleStabilityTest } from './guided-tests/idle-stability.test';
import { revTest } from './guided-tests/rev-test.test';
import { warmupTest } from './guided-tests/warmup-test.test';
import { DtcDecoderService } from './dtc/dtc-decoder.service';
import { DtcCode } from './dtc/dtc-code.model';
import { UnknownDtcLoggerService } from './dtc/unknown-dtc-logger.service';
import { DtcCorrelationService } from './intelligence/dtc-correlation.service';
import { SeverityEngineService } from './intelligence/severity-engine.service';
import { DiagnosticRecommendationService } from './intelligence/diagnostic-recommendation.service';
import { DiagnosticSummaryService } from './intelligence/diagnostic-summary.service';
import { DiagnosisTimelineService } from './intelligence/diagnosis-timeline.service';
import { DriveSignatureService } from './intelligence/drive-signature.service';
import { EvidenceGraphService } from './intelligence/evidence-graph.service';
import { CorrelationFinding, DiagnosisSeverity, DiagnosisRecommendation, DiagnosisSummary, DriveSignature, HypothesisReport, RootCauseCandidate, TimelineEvent } from './intelligence/diagnosis-intelligence.models';
import { RootCauseInferenceService } from './intelligence/root-cause-inference.service';

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
  rootCauseCandidates?: RootCauseCandidate[];
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

  // Frames collected per step for DTC correlation
  private idleFrames: ObdLiveFrame[] = [];
  private revFrames: ObdLiveFrame[] = [];

  constructor(
    @Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter,
    private guidedTestService: GuidedTestService,
    private dtcDecoder: DtcDecoderService,
    private unknownDtcLogger: UnknownDtcLoggerService,
    private dtcCorrelation: DtcCorrelationService,
    private severityEngine: SeverityEngineService,
    private recommendationEngine: DiagnosticRecommendationService,
    private summaryService: DiagnosticSummaryService,
    private timeline: DiagnosisTimelineService,
    private driveSignatureService: DriveSignatureService,
    private evidenceGraphService: EvidenceGraphService,
    private rootCauseInference: RootCauseInferenceService,
  ) {}

  public startDiagnosis(): void {
    this.stopInternal();
    this.sessionActive = true;
    this.stopSubject = new Subject<void>();
    this.idleFrames = [];
    this.revFrames = [];
    this.finalResultSubject.next(null);
    this.timeline.reset();
    this.stateSubject.next(this.getInitialState());
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
          if (!this.sessionActive) return;
          await this.retrieveAndDecodeDtcs();
          if (!this.sessionActive) return;
          if (latestFrame) {
            latestFrame.coolantTemp < 70 ? this.runWarmupMonitoring() : this.runIdleTest();
          } else {
            this.handleError('No data received during baseline scan.');
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

    const timeoutMs = 300000;
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
          if (frame.coolantTemp >= 75 || elapsed >= timeoutMs) {
            this.recordResult(warmupTest.evaluate(collectedFrames));
            this.startTransition('Warm-up complete. Moving to Idle Test...', 'idle_test');
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
        abnormalTrims ? this.runRevTest() : this.runDrivingPrompt();
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

  // ── DTC retrieval and correlation ────────────────────────────────────────

  private async retrieveAndDecodeDtcs(): Promise<void> {
    try {
      const rawCodes = await firstValueFrom(
        (this.obdAdapter.dtcCodes$ ?? of([] as readonly string[])).pipe(take(1))
      );

      let manufacturer: string | undefined;
      if (this.obdAdapter.vinInfo$) {
        const vinInfo = await firstValueFrom(this.obdAdapter.vinInfo$.pipe(take(1)));
        manufacturer = vinInfo?.manufacturer?.toLowerCase() ?? undefined;
      }

      const dtcCodes = this.dtcDecoder.decodeMany([...rawCodes], manufacturer);
      dtcCodes.filter(d => d.source === 'unknown').forEach(d => this.unknownDtcLogger.log(d.code));
      this.updateState({ dtcCodes });
    } catch {
      this.updateState({ dtcCodes: [] });
    }
  }

  // ── Result aggregation ───────────────────────────────────────────────────

  private aggregateResults(): void {
    if (!this.sessionActive) return;

    const state = this.stateSubject.value;
    const dtcCodes = state.dtcCodes ?? [];

    const correlationFindings = this.dtcCorrelation.correlate(dtcCodes, this.idleFrames, this.revFrames);
    const dtcFindings = correlationFindings.map(f => f.message);
    const framePool = this.revFrames.length ? this.revFrames : this.idleFrames;
    const latestFrame = framePool[framePool.length - 1];
    const severity = this.severityEngine.score(dtcCodes, correlationFindings, latestFrame);
    const recommendations = this.recommendationEngine.recommend(dtcCodes, correlationFindings, severity.level);
    const diagnosisSummary = this.summaryService.generate(correlationFindings, severity);

    const driveSignature = this.driveSignatureService.extract(this.idleFrames, this.revFrames);
    const evidenceGraph  = this.evidenceGraphService.buildGraph(dtcCodes, this.idleFrames, this.revFrames, driveSignature);
    const contradictions = this.evidenceGraphService.detectContradictions(dtcCodes, this.idleFrames);
    const hypotheses     = this.evidenceGraphService.rankHypotheses(evidenceGraph);
    const hypothesisReport = this.evidenceGraphService.generateReport(hypotheses, contradictions);
    const rootCauseCandidates = this.rootCauseInference.infer(dtcCodes, correlationFindings, severity, this.idleFrames, this.revFrames);

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
    this.updateState({ status: 'completed', dtcFindings, correlationFindings, severity, recommendations, diagnosisSummary, timelineEvents, driveSignature, hypothesisReport, rootCauseCandidates });
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
    if (target === 'idle_test')       this.runIdleTest();
    else if (target === 'rev_test')   this.runRevTest();
    else if (target === 'driving_prompt') this.runDrivingPrompt();
    else this.aggregateResults();
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
      dtcFindings: []
    };
  }
}
