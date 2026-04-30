import { Pipe, PipeTransform } from '@angular/core';
import { MetricStatus } from '../components/metric-card/metric-card.component';

/** Maps STFT % value to a MetricStatus for the LED dot */
@Pipe({ name: 'stftStatus', standalone: true, pure: true })
export class StftStatusPipe implements PipeTransform {
  transform(value: number): MetricStatus {
    const abs = Math.abs(value);
    if (abs >= 10) return 'critical';
    if (abs >= 5)  return 'warning';
    return 'nominal';
  }
}

/** Maps STFT % value to a badge label */
@Pipe({ name: 'stftBadge', standalone: true, pure: true })
export class StftBadgePipe implements PipeTransform {
  transform(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 10) return 'FAULT';
    if (abs >= 5)  return 'MARGINAL';
    return 'NOMINAL';
  }
}

/** Maps LTFT % value to MetricStatus */
@Pipe({ name: 'ltftStatus', standalone: true, pure: true })
export class LtftStatusPipe implements PipeTransform {
  transform(value: number): MetricStatus {
    const abs = Math.abs(value);
    if (abs >= 15) return 'critical';
    if (abs >= 8)  return 'warning';
    return 'none';
  }
}
