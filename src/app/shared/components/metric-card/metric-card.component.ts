import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type MetricStatus = 'nominal' | 'warning' | 'critical' | 'live' | 'none';

/** 270° arc of a circle with r=42, viewBox 100×100 */
const ARC_LENGTH = 197.92;   // 2π·42 · (270/360)
const CIRCUMFERENCE = 263.89; // 2π·42

@Component({
  selector: 'app-metric-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metric-card.component.html',
  styleUrls: ['./metric-card.component.scss']
})
export class MetricCardComponent {
  @Input() label: string = '';
  @Input() value: string | number | null = '';
  @Input() unit: string = '';

  /** LED / border status colouring */
  @Input() status: MetricStatus = 'none';

  /** Optional sub-label (e.g. "NOMINAL", "LIVE") */
  @Input() badge: string = '';

  // ── Radial gauge inputs ───────────────────────────────────────────────────
  /** Raw numeric value used to position the gauge needle */
  @Input() gaugeValue?: number;
  /** Gauge range minimum (can be negative, e.g. -25 for STFT) */
  @Input() gaugeMin: number = 0;
  /** Gauge range maximum */
  @Input() gaugeMax: number = 100;

  // ── Computed gauge properties ─────────────────────────────────────────────

  /** Fraction (0–1) of the gauge arc to fill */
  get gaugePct(): number {
    if (this.gaugeValue === undefined || this.gaugeMax === this.gaugeMin) return 0;
    const clamped = Math.max(this.gaugeMin, Math.min(this.gaugeMax, this.gaugeValue));
    return (clamped - this.gaugeMin) / (this.gaugeMax - this.gaugeMin);
  }

  /** SVG stroke-dashoffset for the fill arc */
  get dashOffset(): number {
    return ARC_LENGTH * (1 - this.gaugePct);
  }

  /** stroke-dasharray shared by track and fill circles */
  readonly arcDashArray = `${ARC_LENGTH} ${CIRCUMFERENCE}`;
}
