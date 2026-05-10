import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DeepDiagnosisState } from './deep-diagnosis.service';
import { DiagnosisSeverity } from './intelligence/diagnosis-intelligence.models';

export interface HistoryEntry {
  id: string;
  savedAt: number;
  vehicleName: string;
  severity: DiagnosisSeverity | null;
  dtcCount: number;
  isPartial: boolean;
  primaryIssue: string | null;
  state: DeepDiagnosisState;
}

const STORAGE_KEY = 'obd_diagnosis_history';
const MAX_ENTRIES = 20;

@Injectable({ providedIn: 'root' })
export class DiagnosisHistoryService {

  private entriesSubject = new BehaviorSubject<HistoryEntry[]>(this.load());
  public readonly entries$: Observable<HistoryEntry[]> = this.entriesSubject.asObservable();

  save(state: DeepDiagnosisState, vehicleName: string): void {
    if (state.status !== 'completed') return;

    const entry: HistoryEntry = {
      id: 'dx_' + Date.now(),
      savedAt: Date.now(),
      vehicleName,
      severity: state.severity ?? null,
      dtcCount: state.dtcCodes?.length ?? 0,
      isPartial: state.isPartial ?? false,
      primaryIssue: state.rootCauses?.[0]?.title ?? null,
      state,
    };

    const updated = [entry, ...this.entriesSubject.value].slice(0, MAX_ENTRIES);
    this.entriesSubject.next(updated);
    this.persist(updated);
  }

  delete(id: string): void {
    const updated = this.entriesSubject.value.filter(e => e.id !== id);
    this.entriesSubject.next(updated);
    this.persist(updated);
  }

  clearAll(): void {
    this.entriesSubject.next([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* quota */ }
  }

  getById(id: string): HistoryEntry | undefined {
    return this.entriesSubject.value.find(e => e.id === id);
  }

  private persist(entries: HistoryEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch { /* localStorage quota — keep in memory */ }
  }

  private load(): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  }
}
