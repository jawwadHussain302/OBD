import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { DiagnosisHistoryService, HistoryEntry } from '../../core/diagnostics/diagnosis-history.service';
import { DeepDiagnosisService } from '../../core/diagnostics/deep-diagnosis.service';
import { SessionComparisonService } from '../../core/sessions/session-comparison.service';
import { SessionComparisonResult } from '../../core/sessions/session-comparison.models';

@Component({
  selector: 'app-session-summary',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './session-summary.component.html',
  styleUrls: ['./session-summary.component.scss'],
})
export class SessionSummaryComponent {
  private historyService    = inject(DiagnosisHistoryService);
  private diagnosisService  = inject(DeepDiagnosisService);
  private comparisonService = inject(SessionComparisonService);
  private router            = inject(Router);

  readonly entries$: Observable<HistoryEntry[]> = this.historyService.entries$;

  confirmClearAll = false;

  // ── Comparison state ────────────────────────────────────────────────────────
  compareMode     = false;
  selectedIds     = new Set<string>();
  comparisonResult: SessionComparisonResult | null = null;
  comparisonError: string | null = null;

  delete(id: string): void {
    this.historyService.delete(id);
    this.selectedIds.delete(id);
    if (this.selectedIds.size === 0) this.resetComparison();
  }

  clearAll(): void {
    if (this.confirmClearAll) {
      this.historyService.clearAll();
      this.confirmClearAll = false;
      this.resetComparison();
    } else {
      this.confirmClearAll = true;
      setTimeout(() => { this.confirmClearAll = false; }, 3000);
    }
  }

  review(entry: HistoryEntry): void {
    if (this.compareMode) return;
    this.diagnosisService.loadHistoryEntry(entry.state, entry.vehicleName);
    this.router.navigate(['/diagnosis-report']);
  }

  runNew(): void {
    this.router.navigate(['/diagnosis-report']);
  }

  severityClass(level: string | undefined): string {
    return level ? level.toLowerCase() : '';
  }

  // ── Comparison logic ────────────────────────────────────────────────────────

  toggleCompareMode(): void {
    this.compareMode = !this.compareMode;
    if (!this.compareMode) this.resetComparison();
  }

  toggleSelect(entry: HistoryEntry): void {
    if (this.selectedIds.has(entry.id)) {
      this.selectedIds.delete(entry.id);
      this.comparisonResult = null;
      this.comparisonError  = null;
    } else if (this.selectedIds.size < 2) {
      this.selectedIds.add(entry.id);
      this.comparisonError = null;
    } else {
      this.comparisonError = 'Only two sessions can be compared at a time. Deselect one before choosing another.';
    }
  }

  isSelected(entry: HistoryEntry): boolean {
    return this.selectedIds.has(entry.id);
  }

  runComparison(entries: HistoryEntry[]): void {
    const selected = entries
      .filter(e => this.selectedIds.has(e.id))
      .sort((a, b) => a.savedAt - b.savedAt);

    if (selected.length !== 2) {
      this.comparisonError = 'Select exactly two sessions to compare.';
      return;
    }

    const outcome = this.comparisonService.compare(selected[0], selected[1]);
    if (outcome.ok) {
      this.comparisonResult = outcome.result;
      this.comparisonError  = null;
    } else {
      this.comparisonResult = null;
      this.comparisonError  = outcome.error.message;
    }
  }

  effectivenessClass(e: string): string {
    if (e === 'successful') return 'success';
    if (e === 'partial')    return 'warning';
    if (e === 'worsened')   return 'critical';
    return 'muted';
  }

  repairEffectivenessLabel(e: string): string {
    if (e === 'successful') return 'Successful';
    if (e === 'partial')    return 'Partial';
    if (e === 'no_change')  return 'No Change';
    if (e === 'worsened')   return 'Worsened';
    return e;
  }

  private resetComparison(): void {
    this.compareMode      = false;
    this.selectedIds      = new Set();
    this.comparisonResult = null;
    this.comparisonError  = null;
  }
}
