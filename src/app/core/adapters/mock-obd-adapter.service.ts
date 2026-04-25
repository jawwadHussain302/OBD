import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { ObdAdapter } from './obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export type MockMode = 'normal' | 'lean' | 'rich' | 'vacuum-leak' | 'warmup-issue';

@Injectable({
  providedIn: 'root'
})
export class MockObdAdapterService implements ObdAdapter {
  private statusSubject = new BehaviorSubject<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  /** 
   * BehaviorSubject allows new subscribers to get the latest frame immediately.
   * Initialized with null or a baseline frame.
   */
  private dataSubject = new BehaviorSubject<ObdLiveFrame | null>(null);
  
  private simulationSub?: Subscription;
  private currentMode: MockMode = 'normal';
  private targetRpm = 800;
  private currentRpm = 0;
  private coolant = 20;

  /**
   * Observable streams for the application to consume.
   */
  public connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'> = this.statusSubject.asObservable();
  
  /**
   * Cast to non-nullable for the interface if the implementation guarantees data after connection.
   */
  public data$: Observable<ObdLiveFrame> = this.dataSubject.asObservable() as Observable<ObdLiveFrame>;

  constructor() {}

  public async connect(): Promise<void> {
    this.statusSubject.next('connecting');
    
    // Simulate connection handshake
    await new Promise((resolve) => setTimeout(resolve, 1200));
    
    this.statusSubject.next('connected');
    this.startSimulation();
  }

  public async disconnect(): Promise<void> {
    this.stopSimulation();
    this.statusSubject.next('disconnected');
  }

  public async sendCommand(command: string): Promise<string> {
    return `MOCK_OK: ${command}`;
  }

  /**
   * Switches the internal simulation logic to mimic different vehicle states.
   */
  public setMockMode(mode: MockMode): void {
    this.currentMode = mode;
  }

  /**
   * Updates the target engine speed for the simulation.
   */
  public setTargetRpm(rpm: number): void {
    this.targetRpm = rpm;
  }

  private startSimulation(): void {
    this.stopSimulation();
    this.simulationSub = interval(1000).subscribe(() => {
      this.generateFrame();
    });
  }

  private stopSimulation(): void {
    if (this.simulationSub) {
      this.simulationSub.unsubscribe();
      this.simulationSub = undefined;
    }
  }

  private generateFrame(): void {
    // Smooth RPM transition
    this.currentRpm += (this.targetRpm - this.currentRpm) * 0.2;
    
    let stft = 0;
    let ltft = 0;

    // Mode-specific data generation
    switch (this.currentMode) {
      case 'lean':
        // Lean: High positive fuel trims (computer trying to add fuel)
        stft = 10 + Math.random() * 5;
        ltft = 15;
        break;

      case 'rich':
        // Rich: High negative fuel trims (computer trying to remove fuel)
        stft = -10 - Math.random() * 5;
        ltft = -15;
        break;

      case 'vacuum-leak':
        // Vacuum Leak: High trims at idle, improves as RPM increases
        const idleFactor = Math.max(0, 1 - (this.currentRpm / 2500));
        stft = 15 * idleFactor + Math.random() * 2;
        ltft = 18 * idleFactor;
        break;

      case 'warmup-issue':
        // Warmup Issue: Coolant temperature stays below operating range
        if (this.coolant < 65) this.coolant += 0.3;
        break;

      case 'normal':
      default:
        // Normal: Trims near zero, coolant reaching ~90C
        stft = (Math.random() - 0.5) * 4;
        ltft = 1.0;
        if (this.coolant < 90) this.coolant += 0.8;
        break;
    }

    const frame: ObdLiveFrame = {
      timestamp: Date.now(),
      rpm: Math.round(this.currentRpm),
      speed: this.currentRpm > 1000 ? (this.currentRpm - 1000) / 40 : 0,
      engineLoad: 15 + (this.currentRpm / 100),
      coolantTemp: Math.round(this.coolant),
      intakeAirTemp: 32,
      stftB1: Number(stft.toFixed(2)),
      ltftB1: Number(ltft.toFixed(2)),
      throttlePosition: (this.currentRpm / 7000) * 100,
      batteryVoltage: 14.0,
      connectionQuality: 100
    };

    this.dataSubject.next(frame);
  }
}
