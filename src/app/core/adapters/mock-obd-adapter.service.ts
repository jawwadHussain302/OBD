import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { ObdAdapter } from './obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export type MockMode = 'normal' | 'lean' | 'rich' | 'vacuum-leak' | 'warmup-issue';

@Injectable({
  providedIn: 'root'
})
export class MockObdAdapterService implements ObdAdapter {
  private statusSubject = new BehaviorSubject<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  private dataSubject = new Subject<ObdLiveFrame>();
  private stopSim$ = new Subject<void>();
  
  private currentMode: MockMode = 'normal';
  private targetRpm = 750;
  private currentRpm = 750;

  connectionStatus$ = this.statusSubject.asObservable();
  data$ = this.dataSubject.asObservable();

  constructor() {}

  async connect(): Promise<void> {
    this.statusSubject.next('connecting');
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    this.statusSubject.next('connected');
    this.startSimulation();
  }

  async disconnect(): Promise<void> {
    this.stopSim$.next();
    this.statusSubject.next('disconnected');
  }

  async sendCommand(command: string): Promise<string> {
    return `MOCK_RESPONSE_FOR_${command}`;
  }

  /**
   * Allows the UI to switch between different failure scenarios for testing.
   */
  setMockMode(mode: MockMode) {
    this.currentMode = mode;
  }

  /**
   * Allows simulating engine revving in the UI.
   */
  setTargetRpm(rpm: number) {
    this.targetRpm = rpm;
  }

  private startSimulation() {
    this.stopSim$.next(); // Reset if already running

    interval(1000)
      .pipe(takeUntil(this.stopSim$))
      .subscribe(() => {
        const frame = this.generateFrame();
        this.dataSubject.next(frame);
      });
  }

  private generateFrame(): ObdLiveFrame {
    // Smoothly transition RPM toward target
    this.currentRpm += (this.targetRpm - this.currentRpm) * 0.3;
    const jitter = (Math.random() - 0.5) * 20;
    const rpm = Math.max(0, this.currentRpm + jitter);

    // Default base values
    let stft = 0;
    let ltft = 2.0;
    let coolantTemp = 90;
    let engineLoad = (rpm / 7000) * 100;

    // Apply mode-specific logic
    switch (this.currentMode) {
      case 'lean':
        // Condition: Too much air, not enough fuel
        // Result: High positive fuel trims as computer tries to add fuel
        stft = 12.5 + (Math.random() * 5);
        ltft = 15.0;
        break;

      case 'rich':
        // Condition: Too much fuel, not enough air
        // Result: High negative fuel trims as computer tries to pull fuel
        stft = -15.0 - (Math.random() * 5);
        ltft = -18.0;
        break;

      case 'vacuum-leak':
        // Condition: Unmetered air entering at idle
        // Result: High positive trims at idle (low RPM), but improves at higher RPM
        const leakEffect = Math.max(0, 1 - (rpm - 800) / 2000);
        stft = (18.0 * leakEffect) + (Math.random() * 3);
        ltft = 20.0 * leakEffect;
        break;

      case 'warmup-issue':
        // Condition: Engine staying too cold (bad thermostat)
        coolantTemp = 45 + (Math.random() * 5);
        break;

      case 'normal':
      default:
        // Ideal behavior: Trims fluctuate near zero
        stft = (Math.random() - 0.5) * 4;
        ltft = 1.5 + (Math.random() - 0.5);
        break;
    }

    return {
      timestamp: Date.now(),
      rpm: Math.round(rpm),
      speed: rpm > 1000 ? (rpm - 1000) / 50 : 0,
      engineLoad: Math.round(engineLoad),
      coolantTemp: Math.round(coolantTemp),
      intakeAirTemp: 35,
      stftB1: parseFloat(stft.toFixed(2)),
      ltftB1: parseFloat(ltft.toFixed(2)),
      throttlePosition: (rpm / 7000) * 100,
      batteryVoltage: 13.8 + (Math.random() * 0.4),
      connectionQuality: 100
    };
  }
}
