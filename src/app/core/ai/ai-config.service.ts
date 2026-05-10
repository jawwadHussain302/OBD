import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const KEY_STORAGE = 'obd_ai_api_key';

/** Manages the user-supplied Anthropic API key stored in localStorage. */
@Injectable({ providedIn: 'root' })
export class AiConfigService {

  private keySubject = new BehaviorSubject<string | null>(this.loadKey());
  readonly hasKey$ = new BehaviorSubject<boolean>(!!this.loadKey());

  getKey(): string | null {
    return this.keySubject.value;
  }

  setKey(key: string): void {
    const trimmed = key.trim();
    try { localStorage.setItem(KEY_STORAGE, trimmed); } catch { /* quota */ }
    this.keySubject.next(trimmed || null);
    this.hasKey$.next(!!trimmed);
  }

  clearKey(): void {
    try { localStorage.removeItem(KEY_STORAGE); } catch { /* quota */ }
    this.keySubject.next(null);
    this.hasKey$.next(false);
  }

  private loadKey(): string | null {
    try {
      const k = localStorage.getItem(KEY_STORAGE);
      return k && k.trim() ? k.trim() : null;
    } catch {
      return null;
    }
  }
}
