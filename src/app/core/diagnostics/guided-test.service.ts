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

  constructor(@Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter) {}

  /**
   * Starts a guided diagnostic test.
   * Cancels any currently running test.
   */
  public startTest(test: GuidedTest): void {
    this.stopTest(); // ensure any previous test is stopped

    this.isRunningSubject.next(true);
    this.progressSubject.next(0);
    this.resultSubject.next(null);

    const collectedFrames: ObdLiveFrame[] = [];
    const startTime = Date.now();
    const durationMs = test.durationMs;

    // Stream for tracking progress
    const progressTimer$ = timer(0, 100).pipe(
      map(() => {
        const elapsed = Date.now() - startTime;
        const rawProgress = (elapsed / durationMs) * 100;
        return Math.min(Math.round(rawProgress), 100);
      }),
      takeUntil(this.stopSubject)
    );

    // Stream for stopping test at duration limit
    const completionTimer$ = timer(durationMs).pipe(
      takeUntil(this.stopSubject)
    );

    this.testSubscription = new Subscription();

    this.testSubscription.add(
      this.obdAdapter.data$
        .pipe(takeUntil(this.stopSubject))
        .subscribe(frame => collectedFrames.push(frame))
    );

    this.testSubscription.add(
      progressTimer$.subscribe(progress => this.progressSubject.next(progress))
    );

    this.testSubscription.add(
      completionTimer$.pipe(
        finalize(() => {
          this.isRunningSubject.next(false);
        })
      ).subscribe(() => {
        this.progressSubject.next(100);
        const result = test.evaluate(collectedFrames);
        this.resultSubject.next(result);
        this.stopInternal();
      })
    );
  }

  /**
   * Cancels the currently running test without producing a result.
   */
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
