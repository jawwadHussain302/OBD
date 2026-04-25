import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { ObdAdapter } from './obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export type MockMode = 'normal' | 'lean' | 'rich' | 'vacuum leak' | 'warm-up issue';

@Injectable({
  providedIn: 'root'
})
export class MockObdAdapterService implements ObdAdapter {
  private statusSubject = new BehaviorSubject<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  // Initial frame to satisfy BehaviorSubject requirement
  private initialFrame: ObdLiveFrame = {
    timestamp: Date.now(),
    rpm: 0,
    speed: 0,
    engineLoad: 0,
    coolantTemp: 20,
    intakeAirTemp: 20,
    stftB1: 0,
    ltftB1: 0,
    throttlePosition: 0
  };
  
  private dataSubject = new BehaviorSubject<ObdLiveFrame>(this.initialFrame);
  private simulationSub?: Subscription;
  
  private currentMode: MockMode = 'normal';
  private coolant = 20;

  connectionStatus$ = this.statusSubject.asObservable();
  data$ = this.dataSubject.asObservable();

  constructor() {}

  async connect(): Promise<void> {
    this.statusSubject.next('connecting');
    
    // Simulate short handshake
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.statusSubject.next('connected');
    this.startSimulation();
  }

  async disconnect(): Promise<void> {
    this.stopSimulation();
    this.statusSubject.next('disconnected');
  }

  async sendCommand(command: string): Promise<string> {
    return `OK: ${command}`;
  }

  /**
   * Updates the simulation mode to test different diagnostic rules.
   */
  setMode(mode: MockMode) {
    this.currentMode = mode;
  }

  private startSimulation() {
    this.stopSimulation();
    
    this.simulationSub = interval(1000).subscribe(() => {
      this.generateAndEmitFrame();
    });
  }

  private stopSimulation() {
    if (this.simulationSub) {
      this.simulationSub.unsubscribe();
      this.simulationSub = undefined;
    }
  }

  private generateAndEmitFrame() {
    const rpm = 700 + Math.random() * 200; // Idle range
    let stft = 0;
    let ltft = 0;

    // Gradual coolant increase until operating temp
    if (this.currentMode !== 'warm-up issue') {
      if (this.coolant < 90) this.coolant += 0.5;
    } else {
      // Warm-up issue: coolant stays low
      if (this.coolant < 65) this.coolant += 0.2;
    }

    switch (this.currentMode) {
      case 'lean':
        // Lean: Computer adds fuel (positive trims)
        ltft = 12 + Math.random() * 8;
        stft = 5 + Math.random() * 10;
        break;

      case 'rich':
        // Rich: Computer pulls fuel (negative trims)
        ltft = -12 - Math.random() * 8;
        stft = -5 - Math.random() * 10;
        break;

      case 'vacuum leak':
        // Vacuum leak: High positive trims at idle
        ltft = 15 + Math.random() * 5;
        stft = 10 + Math.random() * 5;
        break;

      case 'normal':
      default:
        // Normal: Trims near zero
        stft = -5 + Math.random() * 10;
        ltft = -3 + Math.random() * 8;
        break;
    }

    const frame: ObdLiveFrame = {
      timestamp: Date.now(),
      rpm: Math.round(rpm),
      speed: 0,
      engineLoad: 20 + Math.random() * 5,
      coolantTemp: Math.round(this.coolant),
      intakeAirTemp: 30,
      stftB1: Number(stft.toFixed(1)),
      ltftB1: Number(ltft.toFixed(1)),
      throttlePosition: 15,
      batteryVoltage: 14.1,
      connectionQuality: 100
    };

    this.dataSubject.next(frame);
  }
}
