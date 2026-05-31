import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { combineLatest, map } from 'rxjs';
import { LiveTelemetryService, TelemetryMetricId } from '../../../core/telemetry/live-telemetry.service';

interface DockMetric {
  id: TelemetryMetricId;
  label: string;
  unit: string;
  digits: number;
}

@Component({
  selector: 'app-global-telemetry-dock',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, AsyncPipe],
  templateUrl: './global-telemetry-dock.component.html',
  styleUrls: ['./global-telemetry-dock.component.scss']
})
export class GlobalTelemetryDockComponent {
  private readonly telemetry = inject(LiveTelemetryService);

  readonly metrics: readonly DockMetric[] = [
    { id: 'rpm', label: 'RPM', unit: '', digits: 0 },
    { id: 'coolantTemp', label: 'Coolant', unit: '°C', digits: 0 },
    { id: 'maf', label: 'MAF', unit: 'g/s', digits: 2 },
    { id: 'stftB1', label: 'STFT B1', unit: '%', digits: 1 },
    { id: 'ltftB1', label: 'LTFT B1', unit: '%', digits: 1 },
    { id: 'throttlePosition', label: 'Throttle', unit: '%', digits: 0 },
  ];

  readonly vm$ = combineLatest([
    this.telemetry.frameHistory$,
    this.telemetry.latestFrame$,
    this.telemetry.connectionStatus$,
  ]).pipe(
    map(([history, latest, status]) => ({
      status,
      cards: this.metrics.map(metric => {
        const value = this.telemetry.metricValue(latest, metric.id);
        const samples = history
          .map(frame => this.telemetry.metricValue(frame, metric.id))
          .filter((v): v is number => v !== null)
          .slice(-30);
        return {
          ...metric,
          valueText: value === null ? (status === 'connected' ? 'Waiting…' : 'No data') : value.toFixed(metric.digits),
          sparkline: this.sparklinePoints(samples),
          isLive: status === 'connected' && value !== null,
        };
      }),
    }))
  );

  private sparklinePoints(values: readonly number[]): string {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 22 - ((v - min) / span) * 20;
        return `${x},${y}`;
      })
      .join(' ');
  }
}
