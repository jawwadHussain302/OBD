import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ObdLiveFrame } from '../../../core/models/obd-live-frame.model';

const WINDOW = 40;

@Component({
  selector: 'app-multi-signal-chart',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './multi-signal-chart.component.html',
  styleUrls: ['./multi-signal-chart.component.scss'],
})
export class MultiSignalChartComponent implements OnChanges, OnDestroy {
  @Input() frames: readonly ObdLiveFrame[] = [];
  @ViewChild('multiChart', { read: BaseChartDirective }) chart?: BaseChartDirective;

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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['frames']) {
      this.redraw();
    }
  }

  ngOnDestroy(): void {
    this.chart?.chart?.destroy();
  }

  public clear(): void {
    this.frames = [];
    this.redraw();
  }

  private redraw(): void {
    const visibleFrames = this.frames.slice(-WINDOW);
    this.hasMaf = visibleFrames.some(frame => frame.maf !== undefined);
    this.chartData.datasets[2].hidden = !this.hasMaf;

    const scales = this.chartOptions.scales as Record<string, { display: boolean }>;
    scales['yMaf'].display = this.hasMaf;

    this.chartData.labels = visibleFrames.map((_, i) => String(i));
    this.chartData.datasets[0].data = visibleFrames.map(frame => frame.rpm);
    this.chartData.datasets[1].data = visibleFrames.map(frame => frame.stftB1);
    this.chartData.datasets[2].data = visibleFrames.map(frame => frame.maf ?? null);

    this.chart?.chart?.update('none');
  }
}
