import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DtcCode } from '../../core/diagnostics/dtc/dtc-code.model';

@Component({
  selector: 'app-dtc-code-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dtc-code-card.component.html',
  styleUrls: ['./dtc-code-card.component.scss'],
})
export class DtcCodeCardComponent {
  @Input({ required: true }) dtc!: DtcCode;

  expanded = false;

  get severityClass(): string {
    switch (this.dtc.severity) {
      case 'Low':      return 'severity-low';
      case 'Medium':   return 'severity-medium';
      case 'High':     return 'severity-high';
      case 'Critical': return 'severity-critical';
      default:         return 'severity-unknown';
    }
  }
}
