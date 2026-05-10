import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { GuidedTestResult } from '../models/guided-test.model';

export type FuelTrimTestStep = 'not_started' | 'idle_1' | 'raised_rpm' | 'idle_2' | 'completed';

@Injectable({
  providedIn: 'root'
})
export class FuelTrimTestService {
  private stepSubject = new BehaviorSubject<FuelTrimTestStep>('not_started');
  public step$ = this.stepSubject.asObservable();

  private instructionSubject = new BehaviorSubject<string>('Press start to begin the test.');
  public instruction$ = this.instructionSubject.asObservable();

  private progressSubject = new BehaviorSubject<number>(0);
  public progress$ = this.progressSubject.asObservable();

  private resultSubject = new BehaviorSubject<GuidedTestResult | null>(null);
  public result$ = this.resultSubject.asObservable();

  private idle1Frames: ObdLiveFrame[] = [];
  private raisedFrames: ObdLiveFrame[] = [];
  private idle2Frames: ObdLiveFrame[] = [];

  private timerMs = 0;
  private currentStepTimer = 0;

  startTest(): void {
    this.idle1Frames = [];
    this.raisedFrames = [];
    this.idle2Frames = [];
    this.resultSubject.next(null);
    this.setStep('idle_1', 'Start the engine and let it idle for 15 seconds.');
  }

  processFrame(frame: ObdLiveFrame, dtMs: number): void {
    const step = this.stepSubject.value;
    if (step === 'not_started' || step === 'completed') {
      return;
    }

    this.currentStepTimer += dtMs;

    switch (step) {
      case 'idle_1':
        this.processIdle1(frame);
        break;
      case 'raised_rpm':
        this.processRaisedRpm(frame);
        break;
      case 'idle_2':
        this.processIdle2(frame);
        break;
    }
  }

  private processIdle1(frame: ObdLiveFrame): void {
    this.idle1Frames.push(frame);
    this.progressSubject.next(Math.min(100, (this.currentStepTimer / 15000) * 100));
    if (this.currentStepTimer >= 15000) {
      this.setStep('raised_rpm', 'Hold RPM around 2500 for 10 seconds.');
    }
  }

  private processRaisedRpm(frame: ObdLiveFrame): void {
    this.progressSubject.next(Math.min(100, (this.currentStepTimer / 10000) * 100));
    if (frame.rpm > 2000) {
      this.raisedFrames.push(frame);
    }
    if (this.currentStepTimer >= 10000) {
      this.setStep('idle_2', 'Return to idle for 10 seconds.');
    }
  }

  private processIdle2(frame: ObdLiveFrame): void {
    this.progressSubject.next(Math.min(100, (this.currentStepTimer / 10000) * 100));
    if (frame.rpm < 1200) {
      this.idle2Frames.push(frame);
    }
    if (this.currentStepTimer >= 10000) {
      this.analyzeAndComplete();
    }
  }

  private setStep(step: FuelTrimTestStep, instruction: string): void {
    this.stepSubject.next(step);
    this.instructionSubject.next(instruction);
    this.currentStepTimer = 0;
    this.progressSubject.next(0);
  }

  private analyzeAndComplete(): void {
    this.setStep('completed', 'Test completed.');

    const idleTotal = this.calculateTrimTotal(this.idle1Frames);
    const raisedTotal = this.calculateTrimTotal(this.raisedFrames);

    const result = this.evaluateTrims(idleTotal, raisedTotal);

    this.resultSubject.next({
      testName: 'Fuel Trim Diagnostic Test',
      startedAt: Date.now() - 35000,
      completedAt: Date.now(),
      diagnosis: result.diagnosis,
      confidence: 85,
      evidence: [
        `Idle Total Trim: ${idleTotal.toFixed(1)}%`,
        `Raised RPM Total Trim: ${raisedTotal.toFixed(1)}%`
      ],
      explanation: result.explanation,
      recommendedNextSteps: result.recommendedNextSteps
    });
  }

  private calculateTrimTotal(frames: ObdLiveFrame[]): number {
    const avgLtft = this.avg(frames.map(f => f.ltftB1));
    const avgStft = this.avg(frames.map(f => f.stftB1));
    return avgLtft + avgStft;
  }

  private evaluateTrims(idleTotal: number, raisedTotal: number): {
    diagnosis: string;
    explanation: string;
    recommendedNextSteps: string[];
  } {
    if (idleTotal > 10 && raisedTotal < 5) {
      return {
        diagnosis: 'Likely vacuum leak',
        explanation: 'The ECU is adding fuel at idle, but trims improve at higher RPM. This pattern often points toward unmetered air entering the engine at idle.',
        recommendedNextSteps: ['Inspect vacuum lines', 'Check intake boot', 'Check PCV valve']
      };
    }
    
    if (idleTotal > 10 && raisedTotal > 10) {
      return {
        diagnosis: 'Possible fuel delivery issue',
        explanation: 'The ECU is adding more fuel than expected across all RPM ranges. This usually means the engine is seeing too much air or not enough fuel.',
        recommendedNextSteps: ['Check fuel pressure', 'Inspect fuel pump', 'Check for dirty injectors']
      };
    }
    
    if (idleTotal < -10) {
      return {
        diagnosis: 'Rich condition',
        explanation: 'The ECU is removing fuel because the mixture may be richer than expected.',
        recommendedNextSteps: ['Check leaking injectors', 'Check high fuel pressure']
      };
    }

    return {
      diagnosis: 'Normal',
      explanation: 'Trims are within expected range.',
      recommendedNextSteps: ['No action needed.']
    };
  }

  private avg(arr: number[]): number {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}
