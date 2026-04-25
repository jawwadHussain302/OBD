import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeType = 'disconnected' | 'connecting' | 'connected' | 'warning' | 'critical' | 'info';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [ngClass]="type">{{ text | uppercase }}</span>
  `,
  styleUrls: ['./status-badge.component.scss']
})
export class StatusBadgeComponent {
  @Input() text = '';
  @Input() type: BadgeType | string = 'info';
}
