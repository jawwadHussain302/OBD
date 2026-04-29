import { Injectable } from '@angular/core';

export interface UnknownDtcEntry {
  code: string;
  timestamp: number;
  sessionId: string;
}

const DB_NAME = 'obd-unknown-dtcs';
const STORE_NAME = 'unknown_dtcs';
const DB_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class UnknownDtcLoggerService {
  private db: IDBDatabase | null = null;
  private readonly sessionId = crypto.randomUUID();

  constructor() {
    this.openDb().catch(() => {/* silently skip if IndexedDB unavailable */});
  }

  log(code: string): void {
    const entry: UnknownDtcEntry = { code, timestamp: Date.now(), sessionId: this.sessionId };
    this.openDb()
      .then(db => {
        db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).add(entry);
      })
      .catch(() => {/* fire-and-forget — must not affect diagnosis flow */});
  }

  getAll(): Promise<UnknownDtcEntry[]> {
    return this.openDb().then(
      db => new Promise((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result as UnknownDtcEntry[]);
        req.onerror = () => reject(req.error);
      })
    );
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE_NAME, { autoIncrement: true });
        store.createIndex('code', 'code', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      };
      req.onsuccess = () => { this.db = req.result; resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
  }
}
