import { Injectable, Inject } from '@angular/core';
import { Observable, BehaviorSubject, Subject, Subscription, timer } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
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
  /** Optional retry limit. Defaults to 1 if not specified. */
  retryLimit?: number;
}

export type GuidedTestState = 'IDLE' | 'RUNNING' | 'RETRYING' | 'COMPLETED' | 'FAILED';

@Injectable({
  providedIn: 'root'
})
export class GuidedTestService {
  private readonly stateSubject = new BehaviorSubject<GuidedTestState>('IDLE');
  private readonly progressSubject = new BehaviorSubject<number>(0);
  private readonly resultSubject = new BehaviorSubject<GuidedTestResult | null>(null);

  public readonly state$ = this.stateSubject.asObservable();
  public readonly isRunning$ = this.stateSubject.pipe(map(s => s === 'RUNNING' || s === 'RETRYING'));
  public readonly progress$ = this.progressSubject.asObservable();
  public readonly result$ = this.resultSubject.asObservable();

  private testSubscription?: Subscription;
  private stopSubject = new Subject<void>();
  private runGeneration = 0;
  private currentRetryCount = 0;

  constructor(@Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter) {}

  public startTest(test: GuidedTest): void {
    this.stopTest();
    this.currentRetryCount = 0;
    this.runTestInternal(test, ++this.runGeneration);
  }

  private runTestInternal(test: GuidedTest, generation: number): void {
    this.stopInternal();
    this.stopSubject = new Subject<void>();
    
    this.stateSubject.next(this.currentRetryCount > 0 ? 'RETRYING' : 'RUNNING');
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
        return Math.min(Math.round((elapsed / durationMs) * 100), 100);
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

    const result = test.evaluate(frames);
    
    // If failed and has retries left, retry once by default (or up to limit)
    const retryLimit = test.retryLimit ?? 1;
    if (result.status === 'fail' && this.currentRetryCount < retryLimit) {
      this.currentRetryCount++;
      // Small delay before retry to let things stabilize
      setTimeout(() => {
        if (this.runGeneration === generation) {
          this.runTestInternal(test, generation);
        }
      }, 1000);
      return;
    }

    this.progressSubject.next(100);
    this.resultSubject.next(result);
    this.stateSubject.next(result.status === 'fail' ? 'FAILED' : 'COMPLETED');

    if (this.runGeneration === generation) {
      this.stopInternal();
    }
  }

  public stopTest(): void {
    if (this.stateSubject.value !== 'IDLE') {
      this.stopInternal();
      this.progressSubject.next(0);
      this.stateSubject.next('IDLE');
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
