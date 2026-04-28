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
    private dtcDecoder: DtcDecoderService
  ) {}

  public startDiagnosis(): void {
    this.stopInternal();
    this.sessionActive = true;
    this.stopSubject = new Subject<void>();
    this.idleFrames = [];
    this.revFrames = [];
    this.finalResultSubject.next(null);
    this.stateSubject.next(this.getInitialState());
    this.runBaselineScan();
  }

  public cancelDiagnosis(): void {
    this.sessionActive = false;
    this.stopInternal();
    this.finalResultSubject.next(null);
    this.stateSubject.next({
      ...this.getInitialState(),
      status: 'cancelled',
      currentStep: 'cancelled',
      instruction: 'Diagnosis cancelled by user.'
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

    this.updateState({
      status: 'running',
      currentStep: 'warmup_monitoring',
      instruction: 'Engine is warming up. Keep the vehicle stationary and let it idle.',
      progress: 0
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
    this.updateState({
      status: 'running',
      currentStep: 'idle_test',
      instruction: 'Running Idle Stability Test. Please keep engine idling...',
      progress: 0
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
    this.updateState({
      status: 'running',
      currentStep: 'rev_test',
      instruction: 'Running Engine Response Test. Gradually rev engine to ~2500 RPM and hold.',
      progress: 0
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
    this.updateState({
      status: 'running',
      currentStep: 'driving_prompt',
      instruction: 'Driving analysis is optional. It can improve diagnosis under real engine load.',
      progress: 100
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
      this.updateState({ dtcCodes });
    } catch {
      this.updateState({ dtcCodes: [] });
    }
  }

  private correlateDtcWithFrames(dtcCodes: DtcCode[]): string[] {
    if (!dtcCodes.length) return [];

    const findings: string[] = [];
    const codes = new Set(dtcCodes.map(c => c.code));

    // ── Lean condition: P0171 / P0174 ─────────────────────────────────────
    if (codes.has('P0171') || codes.has('P0174')) {
      if (this.idleFrames.length > 0) {
        const idleStft = this.avg(this.idleFrames.map(f => f.stftB1));
        if (idleStft > 10) {
          if (this.revFrames.length > 0 && this.avg(this.revFrames.map(f => f.stftB1)) < 5) {
            findings.push(
              'P0171: Fuel trims high at idle but improve with RPM — likely vacuum leak. ' +
              'Inspect intake hoses, PCV valve, and intake manifold gaskets.'
            );
          } else {
            findings.push(
              'P0171: Fuel trims elevated across RPM range — possible fuel delivery issue or MAF sensor fault. ' +
              'Check fuel pressure and MAF sensor.'
            );
          }
        } else {
          findings.push('P0171: Lean code present — trims within range during test. May be intermittent.');
        }
      } else {
        findings.push('P0171: Lean condition detected — inspect for vacuum leaks and check fuel pressure.');
      }
    }

    // ── Misfire: P0300–P0304 ──────────────────────────────────────────────
    const misfireCodes = [...codes].filter(c => c >= 'P0300' && c <= 'P0304');
    if (misfireCodes.length > 0) {
      const codeList = misfireCodes.join(', ');
      if (this.idleFrames.length >= 5) {
        const rpmStdDev = this.stddev(this.idleFrames.map(f => f.rpm));
        if (rpmStdDev > 80) {
          findings.push(
            `${codeList}: RPM instability detected during idle — active misfire likely. ` +
            'Check spark plugs, ignition coils, and fuel injectors.'
          );
        } else {
          findings.push(
            `${codeList}: Misfire code present but RPM stable during test — may be intermittent. ` +
            'Inspect spark plugs and coils.'
          );
        }
      } else {
        findings.push(`${codeList}: Misfire detected — inspect spark plugs, ignition coils, and injectors.`);
      }
    }

    // ── MAF: P0100–P0104 ──────────────────────────────────────────────────
    const mafCodes = [...codes].filter(c => c >= 'P0100' && c <= 'P0104');
    if (mafCodes.length > 0) {
      const codeList = mafCodes.join(', ');
      const idleMafFrames = this.idleFrames.filter(f => f.maf != null);
      const revMafFrames  = this.revFrames.filter(f => f.maf != null);

      if (idleMafFrames.length > 0 && revMafFrames.length > 0) {
        const mafIdle = this.avg(idleMafFrames.map(f => f.maf!));
        const mafRev  = this.avg(revMafFrames.map(f => f.maf!));
        const rpmIdle = this.avg(this.idleFrames.map(f => f.rpm));
        const rpmRev  = this.avg(this.revFrames.map(f => f.rpm));

        if (rpmRev > rpmIdle + 500 && mafRev < mafIdle * 1.3) {
          findings.push(
            `${codeList}: MAF reading did not increase with RPM — sensor issue or airflow restriction. ` +
            'Inspect air filter and MAF sensor wiring.'
          );
        } else {
          findings.push(`${codeList}: MAF code present — inspect sensor and air filter.`);
        }
      } else {
        findings.push(`${codeList}: MAF code detected — inspect MAF sensor and air filter.`);
      }
    }

    return findings;
  }

  // ── Result aggregation ───────────────────────────────────────────────────

  private aggregateResults(): void {
    if (!this.sessionActive) return;

    const state = this.stateSubject.value;
    const dtcFindings = this.correlateDtcWithFrames(state.dtcCodes ?? []);

    let finalStatus: 'pass' | 'warning' | 'fail' = 'pass';
    if (state.results.some(r => r.status === 'fail') || (state.dtcCodes?.length ?? 0) > 0) {
      finalStatus = 'fail';
    } else if (state.results.some(r => r.status === 'warning') || dtcFindings.length > 0) {
      finalStatus = 'warning';
    }

    const dtcCount = state.dtcCodes?.length ?? 0;
    const summary = dtcCount > 0
      ? `Full engine diagnosis completed. ${dtcCount} fault code${dtcCount !== 1 ? 's' : ''} detected.`
      : 'Full engine diagnosis completed. No fault codes detected.';

    const finalResult: GuidedTestResult = {
      status: finalStatus,
      summary,
      details: [...state.findings, ...dtcFindings],
      confidence: 0.9
    };

    this.finalResultSubject.next(finalResult);
    this.updateState({ status: 'completed', dtcFindings });
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
    this.updateState({ status: 'error', instruction: message });
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

  private avg(arr: number[]): number {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private stddev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = this.avg(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length);
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
