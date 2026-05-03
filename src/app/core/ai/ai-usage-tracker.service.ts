import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

const STORAGE_KEY = 'obd_ai_usage';
const MONTHLY_LIMIT = 50;

export interface UsageStats {
  used: number;
  remaining: number;
  limit: number;
  month: string;       // 'YYYY-MM'
  pct: number;         // 0–100, used for the progress bar
}

interface StoredUsage {
  month: string;
  count: number;
}

/**
 * Tracks real AI API calls (not fallback) per calendar month in localStorage.
 * Resets automatically on the first call of a new month.
 * All mutation goes through increment() so the count can never drift.
 */
@Injectable({ providedIn: 'root' })
export class AiUsageTrackerService {

  private statsSubject = new BehaviorSubject<UsageStats>(this.computeStats());
  readonly stats$: Observable<UsageStats> = this.statsSubject.asObservable();

  canMakeCall(): boolean {
    return this.load().count < MONTHLY_LIMIT;
  }

  /** Call only after a real API call succeeds — never for fallback paths. */
  increment(): void {
    const stored = this.load();
    stored.count++;
    this.save(stored);
    this.statsSubject.next(this.computeStats());
  }

  getStats(): UsageStats {
    return this.computeStats();
  }

  /** Dev-only reset for testing. */
  resetForTesting(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* quota */ }
    this.statsSubject.next(this.computeStats());
  }

  private load(): StoredUsage {
    const currentMonth = this.currentMonth();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredUsage;
        // Auto-reset on new month
        if (parsed.month === currentMonth) return parsed;
      }
    } catch { /* corrupt data — fall through to fresh record */ }
    return { month: currentMonth, count: 0 };
  }

  private save(stored: StoredUsage): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* quota */ }
  }

  private computeStats(): UsageStats {
    const stored = this.load();
    const used      = stored.count;
    const remaining = Math.max(0, MONTHLY_LIMIT - used);
    const pct       = Math.min(Math.round((used / MONTHLY_LIMIT) * 100), 100);
    return { used, remaining, limit: MONTHLY_LIMIT, month: stored.month, pct };
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
