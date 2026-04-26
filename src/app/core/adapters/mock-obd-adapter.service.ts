import { Injectable } from '@angular/core';
import { 
  BehaviorSubject, 
  Observable, 
  Subject, 
  interval, 
  Subscription 
} from 'rxjs';
import { ObdAdapter } from './obd-adapter.interface';
import { ObdLiveFrame } from '../models/obd-live-frame.model';

export type MockMode = 'normal' | 'lean' | 'rich' | 'vacuum-leak' | 'warmup-issue';

@Injectable({
  providedIn: 'root'
})
export class MockObdAdapterService implements ObdAdapter {
  private connectionStatusSubject = new BehaviorSubject<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  private dataSubject = new Subject<ObdLiveFrame>();
  
  public connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'> =
    this.connectionStatusSubject.asObservable();

  public data$: Observable<ObdLiveFrame> =
    this.dataSubject.asObservable();

  public vinInfo$: Observable<{ vin: string; manufacturer: string } | null> =
    new BehaviorSubject<{ vin: string; manufacturer: string } | null>(null).asObservable();

  private streamSubscription?: Subscription;
  private currentMode: MockMode = 'normal';
  private targetRpm: number = 800;
  private currentCoolantTemp: number = 20;

  public async connect(): Promise<void> {
    if (this.connectionStatusSubject.value === 'connected') return;

    this.connectionStatusSubject.next('connecting');
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.connectionStatusSubject.next('connected');
    this.startStreaming();
  }

  public async disconnect(): Promise<void> {
    if (this.streamSubscription) {
      this.streamSubscription.unsubscribe();
    }
    this.connectionStatusSubject.next('disconnected');
  }

  public async sendCommand(command: string): Promise<string> {
    return `MOCK_OK: ${command}`;
  }

  public setMockMode(mode: MockMode): void {
    this.currentMode = mode;
  }

  public setTargetRpm(rpm: number): void {
    this.targetRpm = rpm;
  }

  public startStreaming(): void {
    if (this.streamSubscription) {
      this.streamSubscription.unsubscribe();
    }

    this.streamSubscription = interval(1000).subscribe(() => {
      this.generateFrame();
    });
  }

  public generateFrame(): void {
    const frame: ObdLiveFrame = {
      timestamp: Date.now(),
      rpm: this.calculateRpm(),
      speed: 0,
      engineLoad: 25 + Math.random() * 10,
      coolantTemp: this.calculateCoolant(),
      intakeAirTemp: 20 + Math.random() * 5,
      stftB1: this.calculateStft(),
      ltftB1: this.calculateLtft(),
      throttlePosition: 15,
      batteryVoltage: 14.2
    };

    this.dataSubject.next(frame);
  }

  private calculateRpm(): number {
    return this.targetRpm + (Math.random() * 50 - 25);
  }

  private calculateCoolant(): number {
    if (this.currentMode === 'warmup-issue') {
      if (this.currentCoolantTemp < 65) this.currentCoolantTemp += 0.1;
    } else {
      if (this.currentCoolantTemp < 90) this.currentCoolantTemp += 0.5;
    }
    return Math.floor(this.currentCoolantTemp);
  }

  private calculateStft(): number {
    switch (this.currentMode) {
      case 'lean': return 5 + Math.random() * 10;
      case 'rich': return -5 - Math.random() * 10;
      case 'vacuum-leak': return this.targetRpm < 1000 ? 15 : 2;
      default: return Math.random() * 4 - 2;
    }
  }

  private calculateLtft(): number {
    switch (this.currentMode) {
      case 'lean': return 12 + Math.random() * 5;
      case 'rich': return -12 - Math.random() * 5;
      case 'vacuum-leak': return this.targetRpm < 1000 ? 18 : 3;
      default: return Math.random() * 2;
    }
  }
}
