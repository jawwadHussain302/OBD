import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionRecorderService } from '../../core/session/session-recorder.service';
import { DiagnosticSession } from '../../core/models/diagnostic-session.model';

@Component({
  selector: 'app-session-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sessions-container">
      <div class="header">
        <h2>Recorded Sessions</h2>
        <p>Review past diagnostic sessions and telemetry.</p>
      </div>

      <div *ngIf="sessions.length === 0" class="empty-state">
        <p>No sessions recorded yet. Go to the Dashboard to record a session.</p>
      </div>

      <div class="session-list" *ngIf="sessions.length > 0">
        <div class="session-card" *ngFor="let session of sessions.reverse()">
          <div class="session-header">
            <h3>{{ session.vehicleSnapshot.make }} {{ session.vehicleSnapshot.model }} ({{ session.vehicleSnapshot.year }})</h3>
            <span class="date">{{ session.startedAt | date:'medium' }}</span>
          </div>
          
          <div class="session-stats">
            <div class="stat">
              <span class="label">Duration:</span>
              <span class="value">{{ getDuration(session) }}</span>
            </div>
            <div class="stat">
              <span class="label">Frames:</span>
              <span class="value">{{ session.frames.length }}</span>
            </div>
            <div class="stat">
              <span class="label">Avg RPM:</span>
              <span class="value">{{ getAvgMetric(session, 'rpm') | number:'1.0-0' }}</span>
            </div>
            <div class="stat">
              <span class="label">Max RPM:</span>
              <span class="value">{{ getMaxMetric(session, 'rpm') | number:'1.0-0' }}</span>
            </div>
            <div class="stat">
              <span class="label">Avg Coolant:</span>
              <span class="value">{{ getAvgMetric(session, 'coolantTemp') | number:'1.0-0' }}°C</span>
            </div>
            <div class="stat">
              <span class="label">Avg STFT:</span>
              <span class="value">{{ getAvgMetric(session, 'stftB1') | number:'1.1-1' }}%</span>
            </div>
            <div class="stat">
              <span class="label">Avg LTFT:</span>
              <span class="value">{{ getAvgMetric(session, 'ltftB1') | number:'1.1-1' }}%</span>
            </div>
          </div>

          <div class="session-diagnostics" *ngIf="session.diagnosticResults.length > 0">
            <h4>Diagnostic Results Detected:</h4>
            <ul>
              <li *ngFor="let res of session.diagnosticResults">
                <span class="badge" [ngClass]="res.severity">{{ res.severity | uppercase }}</span>
                {{ res.title }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./session-summary.component.scss']
})
export class SessionSummaryComponent {
  recorder = inject(SessionRecorderService);
  
  get sessions(): DiagnosticSession[] {
    return this.recorder.getSessions();
  }

  getDuration(session: DiagnosticSession): string {
    const end = session.endedAt || Date.now();
    const ms = end - session.startedAt;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  }

  getAvgMetric(session: DiagnosticSession, metric: keyof typeof session.frames[0]): number {
    if (session.frames.length === 0) return 0;
    const sum = session.frames.reduce((s, f) => s + (f[metric] as number), 0);
    return sum / session.frames.length;
  }

  getMaxMetric(session: DiagnosticSession, metric: keyof typeof session.frames[0]): number {
    if (session.frames.length === 0) return 0;
    return Math.max(...session.frames.map(f => f[metric] as number));
  }
}
