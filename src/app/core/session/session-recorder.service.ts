import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DiagnosticSession } from '../models/diagnostic-session.model';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';
import { VehicleProfile } from '../models/vehicle-profile.model';

@Injectable({
  providedIn: 'root'
})
export class SessionRecorderService {
  private currentSession: DiagnosticSession | null = null;
  private isRecordingSubject = new BehaviorSubject<boolean>(false);
  public isRecording$ = this.isRecordingSubject.asObservable();
  
  private sessions: DiagnosticSession[] = [];

  startRecording(vehicleProfile: VehicleProfile) {
    this.currentSession = {
      sessionId: 'sess_' + Date.now(),
      vehicleProfileId: vehicleProfile.id,
      vehicleSnapshot: { ...vehicleProfile },
      startedAt: Date.now(),
      frames: [],
      diagnosticResults: []
    };
    this.isRecordingSubject.next(true);
  }

  recordFrame(frame: ObdLiveFrame) {
    if (this.currentSession && this.isRecordingSubject.value) {
      this.currentSession.frames.push(frame);
    }
  }

  recordDiagnosticResult(results: DiagnosticResult[]) {
    if (this.currentSession && this.isRecordingSubject.value) {
      // Avoid duplicates
      for (const res of results) {
        if (!this.currentSession.diagnosticResults.some(r => r.issueId === res.issueId)) {
          this.currentSession.diagnosticResults.push(res);
        }
      }
    }
  }

  stopRecording(): DiagnosticSession | null {
    if (!this.currentSession) return null;
    
    this.currentSession.endedAt = Date.now();
    this.sessions.push(this.currentSession);
    this.isRecordingSubject.next(false);
    
    const session = this.currentSession;
    this.currentSession = null;
    return session;
  }

  getSessions(): DiagnosticSession[] {
    return this.sessions;
  }
}
