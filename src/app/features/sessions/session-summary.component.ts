import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { DiagnosisHistoryService, HistoryEntry } from '../../core/diagnostics/diagnosis-history.service';
import { DeepDiagnosisService } from '../../core/diagnostics/deep-diagnosis.service';

@Component({
  selector: 'app-session-summary',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './session-summary.component.html',
  styleUrls: ['./session-summary.component.scss'],
})
export class SessionSummaryComponent {
  private historyService   = inject(DiagnosisHistoryService);
  private diagnosisService = inject(DeepDiagnosisService);
  private router           = inject(Router);

  readonly entries$: Observable<HistoryEntry[]> = this.historyService.entries$;

  confirmClearAll = false;

  delete(id: string): void {
    this.historyService.delete(id);
  }

  clearAll(): void {
    if (this.confirmClearAll) {
      this.historyService.clearAll();
      this.confirmClearAll = false;
    } else {
      this.confirmClearAll = true;
      setTimeout(() => { this.confirmClearAll = false; }, 3000);
    }
  }

  review(entry: HistoryEntry): void {
    // Pass vehicleName so the report page uses the original vehicle, not the current profile
    this.diagnosisService.loadHistoryEntry(entry.state, entry.vehicleName);
    this.router.navigate(['/diagnosis-report']);
  }

  runNew(): void {
    this.router.navigate(['/diagnosis-report']);
  }

  severityClass(level: string | undefined): string {
    return level ? level.toLowerCase() : '';
  }
}
