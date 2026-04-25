import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionRecorderService } from '../../core/session/session-recorder.service';
import { DiagnosticSession } from '../../core/models/diagnostic-session.model';

@Component({
  selector: 'app-session-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-summary.component.html',
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
