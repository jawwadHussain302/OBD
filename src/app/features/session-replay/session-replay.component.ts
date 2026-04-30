import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { SessionReplayService, ReplaySession } from '../../core/replay/session-replay.service';
import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';
import { DiagnosticResult } from '../../core/models/diagnostic-result.model';

@Component({
  selector: 'app-session-replay',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './session-replay.component.html',
  styleUrls: ['./session-replay.component.scss'],
})
export class SessionReplayComponent implements OnInit, OnDestroy {

  session: ReplaySession | null = null;
  currentFrame: ObdLiveFrame | null = null;
  progress = 0;
  isPlaying = false;
  speed: 1 | 2 | 4 = 1;

  private subs = new Subscription();

  constructor(public replayService: SessionReplayService) {}

  ngOnInit(): void {
    this.subs.add(
      this.replayService.session$.subscribe(s => (this.session = s))
    );
    this.subs.add(
      this.replayService.replayFrame$.subscribe(f => (this.currentFrame = f))
    );
    this.subs.add(
      this.replayService.progress$.subscribe(p => (this.progress = p))
    );
    this.subs.add(
      this.replayService.isPlaying$.subscribe(v => (this.isPlaying = v))
    );
    this.subs.add(
      this.replayService.speed$.subscribe(s => (this.speed = s))
    );
  }

  ngOnDestroy(): void {
    this.replayService.stop();
    this.subs.unsubscribe();
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  play():  void { this.replayService.play();  }
  pause(): void { this.replayService.pause(); }
  stop():  void { this.replayService.stop();  }

  setSpeed(s: 1 | 2 | 4): void { this.replayService.setSpeed(s); }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  get diagnosticResults(): DiagnosticResult[] {
    return this.session?.diagnosticResults ?? [];
  }

  get frameCount(): number {
    return this.session?.frames.length ?? 0;
  }

  get durationSec(): number {
    return Math.round((this.session?.durationMs ?? 0) / 1000);
  }

  severityClass(r: DiagnosticResult): string {
    return r.severity;
  }
}
