import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';

const STORAGE_KEY = 'obd2_last_replay_session';
/** Maximum frames stored per session to prevent unbounded memory growth. */
const MAX_SESSION_FRAMES = 3000;

export interface ReplaySession {
  savedAt: number;
  durationMs: number;
  frames: ObdLiveFrame[];
  diagnosticResults: DiagnosticResult[];
}

/**
 * Stores the last live session and can replay its frames through replayFrame$.
 * No backend — persists to localStorage.
 */
@Injectable({ providedIn: 'root' })
export class SessionReplayService implements OnDestroy {

  // ─── Stored session ────────────────────────────────────────────────────────

  private sessionSubject = new BehaviorSubject<ReplaySession | null>(this.loadFromStorage());
  public readonly session$: Observable<ReplaySession | null> = this.sessionSubject.asObservable();

  // ─── Playback state ────────────────────────────────────────────────────────

  private frameSubject    = new Subject<ObdLiveFrame>();
  private progressSubject = new BehaviorSubject<number>(0);
  private isPlayingSubject = new BehaviorSubject<boolean>(false);
  private speedSubject    = new BehaviorSubject<1 | 2 | 4>(1);

  public readonly replayFrame$:  Observable<ObdLiveFrame> = this.frameSubject.asObservable();
  public readonly progress$:     Observable<number>       = this.progressSubject.asObservable();
  public readonly isPlaying$:    Observable<boolean>      = this.isPlayingSubject.asObservable();
  public readonly speed$:        Observable<1 | 2 | 4>   = this.speedSubject.asObservable();

  private replayTimer?: ReturnType<typeof setInterval>;
  private replayIndex = 0;

  // ─── Session persistence ───────────────────────────────────────────────────

  /**
   * Called by the dashboard at session end (clear / disconnect / destroy).
   * Persists the most recent batch of frames + diagnostic results.
   */
  public saveSession(
    frames: ObdLiveFrame[],
    diagnosticResults: DiagnosticResult[],
  ): void {
    if (!frames.length) return;

    // Trim to the most recent MAX_SESSION_FRAMES to cap memory and localStorage usage
    const cappedFrames = frames.length > MAX_SESSION_FRAMES
      ? frames.slice(frames.length - MAX_SESSION_FRAMES)
      : [...frames];

    const session: ReplaySession = {
      savedAt: Date.now(),
      durationMs: cappedFrames[cappedFrames.length - 1].timestamp - cappedFrames[0].timestamp,
      frames: cappedFrames,
      diagnosticResults: [...diagnosticResults],
    };

    this.sessionSubject.next(session);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // localStorage quota may be full — store in memory only
    }
  }

  public hasSession(): boolean {
    return (this.sessionSubject.value?.frames?.length ?? 0) > 0;
  }

  public getSession(): ReplaySession | null {
    return this.sessionSubject.value;
  }

  // ─── Playback control ──────────────────────────────────────────────────────

  public play(): void {
    if (!this.hasSession() || this.isPlayingSubject.value) return;

    const frames = this.sessionSubject.value!.frames;

    this.isPlayingSubject.next(true);
    const intervalMs = Math.round(1000 / this.speedSubject.value);

    this.replayTimer = setInterval(() => {
      if (this.replayIndex >= frames.length) {
        this.stop();
        return;
      }
      this.frameSubject.next(frames[this.replayIndex]);
      // Guard against single-frame sessions where (length - 1) === 0
      this.progressSubject.next(
        Math.round((this.replayIndex / Math.max(1, frames.length - 1)) * 100)
      );
      this.replayIndex++;
    }, intervalMs);
  }

  public pause(): void {
    clearInterval(this.replayTimer);
    this.isPlayingSubject.next(false);
  }

  public stop(): void {
    clearInterval(this.replayTimer);
    this.isPlayingSubject.next(false);
    this.replayIndex = 0;
    this.progressSubject.next(0);
  }

  public setSpeed(speed: 1 | 2 | 4): void {
    const wasPlaying = this.isPlayingSubject.value;
    if (wasPlaying) this.pause();
    this.speedSubject.next(speed);
    if (wasPlaying) this.play();
  }

  public ngOnDestroy(): void {
    this.stop();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private loadFromStorage(): ReplaySession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ReplaySession;
    } catch {
      return null;
    }
  }
}
