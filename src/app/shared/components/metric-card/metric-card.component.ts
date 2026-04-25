import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="metric-card" [class.warning]="isWarning">
      <div class="metric-value">{{ value }}<span class="unit" *ngIf="unit">{{ unit }}</span></div>
      <div class="metric-label">{{ label }}</div>
    </div>
  `,
  styleUrls: ['./metric-card.component.scss']
})
export class MetricCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() unit = '';
  @Input() isWarning = false;
}
