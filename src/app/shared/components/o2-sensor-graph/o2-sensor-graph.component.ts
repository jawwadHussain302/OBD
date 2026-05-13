import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { NgIf, NgClass } from '@angular/common';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Subscription, throttleTime } from 'rxjs';
import {
  O2SensorBufferService,
  O2SensorBufferState,
  O2BankAnalytics,
  NO_ANALYTICS,
} from '../../../core/diagnostics/o2-sensor-buffer.service';

/** Number of frames shown on the chart (30 s at 5 Hz). */
const CHART_WINDOW = 150;

/** Status derived from live analytics. */
type O2Status = 'normal' | 'mildly_degraded' | 'severely_degraded' | 'monitoring' | 'no_data';

function deriveStatus(a: O2BankAnalytics): O2Status {
  if (!a.hasData) return 'no_data';
  if (a.crossCorrelation > 0.75) return 'severely_degraded';
  if (a.crossCorrelation > 0.40) return 'mildly_degraded';
  if (a.downstreamIsStable)      return 'normal';
  return 'monitoring';
}

const STATUS_LABELS: Record<O2Status, string> = {
  normal:            'Normal',
  mildly_degraded:   'Mildly Degraded',
  severely_degraded: 'Severely Degraded',
  monitoring:        'Monitoring…',
  no_data:           'No Data',
};

const STATUS_CSS: Record<O2Status, string> = {
  normal:            'o2-status--normal',
  mildly_degraded:   'o2-status--warning',
  severely_degraded: 'o2-status--critical',
  monitoring:        'o2-status--muted',
  no_data:           'o2-status--muted',
};

@Component({
  selector: 'app-o2-sensor-graph',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgClass, BaseChartDirective],
  templateUrl: './o2-sensor-graph.component.html',
  styleUrls: ['./o2-sensor-graph.component.scss'],
})
export class O2SensorGraphComponent implements OnInit, OnDestroy {
  private readonly buffer = inject(O2SensorBufferService);
  private readonly cdr    = inject(ChangeDetectorRef);
  private sub?: Subscription;

  @ViewChild('o2Chart', { read: BaseChartDirective }) chart?: BaseChartDirective;

  selectedBank: 1 | 2 = 1;

  // ── View state (updated by update()) ────────────────────────────────────────
  hasData         = false;
  hasUpstream     = false;
  hasDownstream   = false;
  status: O2Status = 'no_data';
  statusLabel     = STATUS_LABELS['no_data'];
  statusClass     = STATUS_CSS['no_data'];
  upstreamHz      = '—';
  downstreamHz    = '—';
  correlationPct  = '—';
  upstreamMeanV   = '—';
  downstreamMeanV = '—';

  // ── Chart configuration ──────────────────────────────────────────────────────
  chartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'Upstream (S1)',
        data: [],
        borderColor: '#4caf50',
        backgroundColor: 'rgba(76,175,80,0.08)',
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2.5,
        borderDash: [6, 3],
        yAxisID: 'yVolt',
      },
      {
        label: 'Downstream (S2)',
        data: [],
        borderColor: '#9c27b0',
        backgroundColor: 'rgba(156,39,176,0.08)',
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        yAxisID: 'yVolt',
      },
    ],
  };

  chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#cccccc',
          font: { size: 11 },
          boxWidth: 12,
          padding: 14,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(30,30,30,0.92)',
        titleColor: '#ffffff',
        bodyColor: '#cccccc',
        borderColor: '#333333',
        borderWidth: 1,
        callbacks: {
          label: ctx => {
            const v = ctx.raw as number | null;
            return v === null
              ? `${ctx.dataset.label}: —`
              : `${ctx.dataset.label}: ${v.toFixed(3)} V`;
          },
        },
      },
    },
    scales: {
      x: { display: false },
      yVolt: {
        type: 'linear',
        position: 'left',
        min: -0.05,
        max: 1.3,
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#aaaaaa', maxTicksLimit: 7, font: { size: 10 } },
        title: { display: true, text: 'Voltage (V)', color: '#aaaaaa', font: { size: 10 } },
      },
    },
  };

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.sub = this.buffer.state$.pipe(
      throttleTime(400, undefined, { leading: true, trailing: true }),
    ).subscribe(state => this.update(state));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.chart?.chart?.destroy();
  }

  // ── Public ───────────────────────────────────────────────────────────────────

  selectBank(bank: 1 | 2): void {
    this.selectedBank = bank;
    this.update(this.buffer.state$.getValue());
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private update(state: O2SensorBufferState): void {
    const frames    = this.selectedBank === 1 ? state.bank1Frames : state.bank2Frames;
    const analytics = this.selectedBank === 1 ? state.bank1Analytics : state.bank2Analytics;

    this.status        = deriveStatus(analytics);
    this.statusLabel   = STATUS_LABELS[this.status];
    this.statusClass   = STATUS_CSS[this.status];
    this.hasData       = analytics.hasData;
    this.hasUpstream   = analytics.hasUpstream;
    this.hasDownstream = analytics.hasDownstream;

    if (analytics.hasData) {
      this.upstreamHz      = analytics.hasUpstream   ? analytics.upstreamSwitchingHz.toFixed(2)  : '—';
      this.downstreamHz    = analytics.hasDownstream ? analytics.downstreamSwitchingHz.toFixed(2) : '—';
      this.correlationPct  = (analytics.hasUpstream && analytics.hasDownstream)
                               ? (analytics.crossCorrelation * 100).toFixed(0) : '—';
      this.upstreamMeanV   = analytics.hasUpstream   ? analytics.upstreamMean.toFixed(3)   : '—';
      this.downstreamMeanV = analytics.hasDownstream ? analytics.downstreamMean.toFixed(3)  : '—';
    } else {
      this.upstreamHz = this.downstreamHz = this.correlationPct = '—';
      this.upstreamMeanV = this.downstreamMeanV = '—';
    }

    // Rebuild chart window
    const window = frames.slice(-CHART_WINDOW);
    const labels   = window.map((_, i) => String(i));
    const upData   = window.map(f => f.upstream);
    const downData = window.map(f => f.downstream);

    this.chartData.labels         = labels;
    this.chartData.datasets[0].data = upData;
    this.chartData.datasets[1].data = downData;

    // Also push directly to the Chart.js instance so OnPush + ng2-charts
    // binding delays don't silently drop the upstream series.
    const cjs = this.chart?.chart;
    if (cjs) {
      cjs.data.labels            = labels;
      cjs.data.datasets[0].data  = upData;
      cjs.data.datasets[1].data  = downData;
    }

    this.chart?.chart?.update('none');
    this.cdr.markForCheck();
  }
}

export { NO_ANALYTICS };
