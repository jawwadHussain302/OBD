import { Component, OnInit, OnDestroy, ViewChild, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Subscription } from 'rxjs';
import { ObdAdapter, OBD_ADAPTER } from '../../../core/adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../../../core/models/obd-live-frame.model';

const WINDOW = 40; // rolling frame window

@Component({
  selector: 'app-multi-signal-chart',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './multi-signal-chart.component.html',
  styleUrls: ['./multi-signal-chart.component.scss'],
})
export class MultiSignalChartComponent implements OnInit, OnDestroy {
  @ViewChild('multiChart', { read: BaseChartDirective }) chart?: BaseChartDirective;

  /** True once at least one frame carries MAF data */
  hasMaf = false;

  chartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'RPM',
        data: [],
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76,175,80,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
        yAxisID: 'yRpm',
      },
      {
        label: 'STFT B1 %',
        data: [],
        borderColor: '#2196F3',
        backgroundColor: 'rgba(33,150,243,0.08)',
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
        yAxisID: 'yPct',
      },
      {
        label: 'MAF g/s',
        data: [],
        borderColor: '#ff9800',
        backgroundColor: 'rgba(255,152,0,0.08)',
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1.5,
        yAxisID: 'yMaf',
        hidden: true,
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
          boxWidth: 14,
          padding: 12,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(30,30,30,0.92)',
        titleColor: '#ffffff',
        bodyColor: '#cccccc',
        borderColor: '#333333',
        borderWidth: 1,
      },
    },
    scales: {
      x: { display: false },
      yRpm: {
        type: 'linear',
        position: 'left',
        min: 0,
        max: 4200,
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#4CAF50', maxTicksLimit: 5, font: { size: 10 } },
        title: { display: true, text: 'RPM', color: '#4CAF50', font: { size: 10 } },
      },
      yPct: {
        type: 'linear',
        position: 'right',
        min: -28,
        max: 28,
        grid: { drawOnChartArea: false },
        ticks: { color: '#2196F3', maxTicksLimit: 5, font: { size: 10 } },
        title: { display: true, text: 'STFT %', color: '#2196F3', font: { size: 10 } },
      },
      yMaf: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: 16,
        display: false,
        grid: { drawOnChartArea: false },
        ticks: { color: '#ff9800', maxTicksLimit: 4, font: { size: 10 } },
        title: { display: false, text: 'MAF g/s', color: '#ff9800', font: { size: 10 } },
      },
    },
  };

  private frames: ObdLiveFrame[] = [];
  private frameCount = 0;
  private sub!: Subscription;

  constructor(@Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter) {}

  ngOnInit(): void {
    this.sub = this.obdAdapter.data$.subscribe(frame => this.handleFrame(frame));
  }

  ngOnDestroy(): void {
    this.chart?.chart?.destroy();
    this.sub?.unsubscribe();
  }

  /** Reset the internal frame buffer and clear all datasets (called by dashboard clearCharts). */
  public clear(): void {
    this.frames = [];
    this.frameCount = 0;
    this.hasMaf = false;

    // Hide MAF dataset and axis again
    this.chartData.datasets[2].hidden = true;
    const scales = this.chartOptions.scales as Record<string, { display: boolean }>;
    scales['yMaf'].display = false;

    // Empty all dataset arrays in-place
    this.chartData.labels = [];
    this.chartData.datasets[0].data = [];
    this.chartData.datasets[1].data = [];
    this.chartData.datasets[2].data = [];

    this.chart?.chart?.update('none');
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private handleFrame(frame: ObdLiveFrame): void {
    this.frames.push(frame);
    if (this.frames.length > WINDOW) this.frames.shift();

    this.frameCount++;

    // Reveal MAF dataset + axis once data arrives
    if (!this.hasMaf && frame.maf !== undefined) {
      this.hasMaf = true;
      this.chartData.datasets[2].hidden = false;
      const scales = this.chartOptions.scales as Record<string, { display: boolean }>;
      scales['yMaf'].display = true;
    }

    // Update every other frame for smoother rendering
    if (this.frameCount % 2 === 0) {
      this.redraw();
    }
  }

  private redraw(): void {
    const labels = this.frames.map((_, i) => String(i));

    this.chartData.labels = labels;
    this.chartData.datasets[0].data = this.frames.map(f => f.rpm);
    this.chartData.datasets[1].data = this.frames.map(f => f.stftB1);
    this.chartData.datasets[2].data = this.frames.map(f => f.maf ?? null as unknown as number);

    this.chart?.chart?.update('none');
  }
}
