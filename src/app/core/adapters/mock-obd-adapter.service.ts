import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, timer, Subscription } from 'rxjs';
import { ObdAdapter } from './obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export type MockMode = 'normal' | 'lean' | 'rich' | 'vacuum-leak' | 'warmup-issue';

@Injectable({
  providedIn: 'root'
})
export class MockObdAdapterService implements ObdAdapter {
  private statusSubject = new BehaviorSubject<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  private dataSubject = new Subject<ObdLiveFrame>();
  private currentMode: MockMode = 'normal';
  private frameSub?: Subscription;

  // Internal state for simulation
  private state = {
    rpm: 0,
    speed: 0,
    coolantTemp: 20,
    stftB1: 0,
    ltftB1: 0,
    targetRpm: 750,
    elapsedMs: 0
  };

  public readonly connectionStatus$ = this.statusSubject.asObservable();
  public readonly data$ = this.dataSubject.asObservable();

  setMockMode(mode: MockMode) {
    this.currentMode = mode;
  }

  getMockMode(): MockMode {
    return this.currentMode;
  }
  
  setTargetRpm(rpm: number) {
    this.state.targetRpm = rpm;
  }

  async connect(): Promise<void> {
    this.statusSubject.next('connecting');
    return new Promise((resolve) => {
      setTimeout(() => {
        this.statusSubject.next('connected');
        this.startStreaming();
        resolve();
      }, 1000);
    });
  }

  async disconnect(): Promise<void> {
    if (this.frameSub) {
      this.frameSub.unsubscribe();
      this.frameSub = undefined;
    }
    this.statusSubject.next('disconnected');
  }

  async sendCommand(command: string): Promise<string> {
    if (command === '0902') { // VIN
      return '1HGCM82633A00435';
    }
    return 'NO DATA';
  }

  private startStreaming() {
    this.state = {
      rpm: 0,
      speed: 0,
      coolantTemp: 20, // Start cold
      stftB1: 0,
      ltftB1: 0,
      targetRpm: 750,
      elapsedMs: 0
    };

    this.frameSub = timer(0, 100).subscribe(() => {
      this.generateFrame();
    });
  }

  private generateFrame() {
    this.state.elapsedMs += 100;
    
    // Simulate RPM moving towards target
    this.state.rpm += (this.state.targetRpm - this.state.rpm) * 0.1;
    // Add noise to RPM
    const noisyRpm = this.state.rpm + (Math.random() * 20 - 10);

    // Default target trims
    let targetStft = 0;
    let targetLtft = 0;

    switch (this.currentMode) {
      case 'normal':
        targetLtft = (Math.random() * 8) - 4; // -4 to +4
        targetStft = (Math.random() * 10) - 5; // -5 to +5
        break;
      case 'lean':
        targetLtft = 15 + (Math.random() * 5); // 15 to 20
        targetStft = 5 + (Math.random() * 10); // 5 to 15
        break;
      case 'rich':
        targetLtft = -15 - (Math.random() * 5); // -15 to -20
        targetStft = -5 - (Math.random() * 10); // -5 to -15
        break;
      case 'vacuum-leak':
        if (noisyRpm < 1500) {
          // high trims at idle
          targetLtft = 18 + (Math.random() * 5);
          targetStft = 8 + (Math.random() * 5);
        } else {
          // improves at higher RPM
          targetLtft = 4 + (Math.random() * 4);
          targetStft = 2 + (Math.random() * 4);
        }
        break;
      case 'warmup-issue':
        targetLtft = (Math.random() * 8) - 4;
        targetStft = (Math.random() * 10) - 5;
        break;
    }

    // Smooth transition for LTFT
    this.state.ltftB1 += (targetLtft - this.state.ltftB1) * 0.05;
    // Fast transition for STFT
    this.state.stftB1 += (targetStft - this.state.stftB1) * 0.2;

    // Simulate Coolant Temp
    if (this.currentMode === 'warmup-issue') {
      // Max 65 C
      if (this.state.coolantTemp < 65) {
        this.state.coolantTemp += 0.05;
      }
    } else {
      // Normal warmup to 90 C
      if (this.state.coolantTemp < 90) {
        this.state.coolantTemp += 0.1;
      }
    }

    const frame: ObdLiveFrame = {
      timestamp: Date.now(),
      rpm: noisyRpm,
      speed: this.state.speed,
      engineLoad: (noisyRpm / 6000) * 100 + (Math.random() * 5),
      coolantTemp: this.state.coolantTemp,
      intakeAirTemp: 25,
      stftB1: this.state.stftB1,
      ltftB1: this.state.ltftB1,
      maf: (noisyRpm / 1000) * 3,
      throttlePosition: (noisyRpm / 6000) * 100,
      batteryVoltage: 14.2 + (Math.random() * 0.2),
      connectionQuality: 100
    };

    this.dataSubject.next(frame);
  }
}
