import { Injectable, Inject } from '@angular/core';
import { Observable, BehaviorSubject, Subject, Subscription, timer } from 'rxjs';
import { takeUntil, map, finalize } from 'rxjs/operators';
import { ObdAdapter, OBD_ADAPTER } from '../adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export interface GuidedTestResult {
  status: 'pass' | 'warning' | 'fail';
  summary: string;
  details?: string[];
  confidence?: number;
}

export interface GuidedTest {
  id: string;
  name: string;
  durationMs: number;
  evaluate(frames: ObdLiveFrame[]): GuidedTestResult;
  /** Optional custom progress calculator. Returns 0-100. */
  calculateProgress?: (frames: ObdLiveFrame[]) => number;
  /** Optional early completion check. If returns true, test finishes immediately. */
  checkEarlyCompletion?: (frames: ObdLiveFrame[]) => boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GuidedTestService {
  private readonly isRunningSubject = new BehaviorSubject<boolean>(false);
  private readonly progressSubject = new BehaviorSubject<number>(0);
  private readonly resultSubject = new BehaviorSubject<GuidedTestResult | null>(null);

  public readonly isRunning$ = this.isRunningSubject.asObservable();
  public readonly progress$ = this.progressSubject.asObservable();
  public readonly result$ = this.resultSubject.asObservable();

  private testSubscription?: Subscription;
  private stopSubject = new Subject<void>();

  // Monotonically increasing counter — each startTest() call gets a unique
  // generation number.  Completion callbacks compare against this to detect
  // whether a newer test was started synchronously inside a result handler
  // (e.g. DeepDiagnosisService calling startTest(revTest) while still inside
  // the idle-test result callback).  Without this guard the old test's
  // teardown fires a second time and immediately kills the new test's timers,
  // leaving progress stuck at 0%.
  private runGeneration = 0;

  constructor(@Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter) {}

  public startTest(test: GuidedTest): void {
    this.stopTest();

    // Give this run its own stop signal.  If stopTest() above already called
    // stopInternal() and fired the old Subject, the new subscriptions below
    // must not share it — otherwise any pending teardown from the previous
    // test that runs after this point (e.g. the second stopInternal() call
    // in GuidedTestService's completion callback) will cancel the new run.
    this.stopSubject = new Subject<void>();
    const generation = ++this.runGeneration;

    this.isRunningSubject.next(true);
    this.progressSubject.next(0);
    this.resultSubject.next(null);

    const collectedFrames: ObdLiveFrame[] = [];
    const startTime = Date.now();
    const durationMs = test.durationMs;

    const progressTimer$ = timer(0, 100).pipe(
      map(() => {
        if (test.calculateProgress) {
          return test.calculateProgress(collectedFrames);
        }
        const elapsed = Date.now() - startTime;
        const rawProgress = (elapsed / durationMs) * 100;
        return Math.min(Math.round(rawProgress), 100);
      }),
      takeUntil(this.stopSubject)
    );

    const completionTimer$ = timer(durationMs).pipe(
      takeUntil(this.stopSubject)
    );

    this.testSubscription = new Subscription();

    this.testSubscription.add(
      this.obdAdapter.data$
        .pipe(takeUntil(this.stopSubject))
        .subscribe(frame => {
          collectedFrames.push(frame);
          if (test.checkEarlyCompletion?.(collectedFrames)) {
            this.finishTest(test, collectedFrames, generation);
          }
        })
    );

    this.testSubscription.add(
      progressTimer$.subscribe(progress => this.progressSubject.next(progress))
    );

    this.testSubscription.add(
      completionTimer$.subscribe(() => {
        this.finishTest(test, collectedFrames, generation);
      })
    );
  }

  private finishTest(test: GuidedTest, frames: ObdLiveFrame[], generation: number): void {
    if (this.runGeneration !== generation) return;

    this.progressSubject.next(100);
    const result = test.evaluate(frames);
    this.resultSubject.next(result);

    // Only mark as stopped if no newer test has taken over.
    if (this.runGeneration === generation) {
      this.isRunningSubject.next(false);
      this.stopInternal();
    }
  }

  public stopTest(): void {
    if (this.isRunningSubject.value) {
      this.stopInternal();
      this.progressSubject.next(0);
      this.isRunningSubject.next(false);
    }
  }

  private stopInternal(): void {
    this.stopSubject.next();
    if (this.testSubscription) {
      this.testSubscription.unsubscribe();
      this.testSubscription = undefined;
    }
  }
}
