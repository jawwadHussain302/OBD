import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ObdLiveFrame } from '../../../core/models/obd-live-frame.model';
import {
  MiniGraphConfig,
  makeMiniLineData,
  MINI_CHART_OPTIONS,
  MINI_CHART_COLORS,
  MINI_CHART_LABELS
} from '../../chart-configs/mini-chart-configs';

const WINDOW = 20;

@Component({
  selector: 'app-mini-graph',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './mini-graph.component.html',
  styleUrls: ['./mini-graph.component.scss']
})
export class MiniGraphComponent implements OnInit, OnChanges, OnDestroy {
  @Input() config: MiniGraphConfig = 'idle';
  @Input() frames: readonly ObdLiveFrame[] = [];
  @ViewChild('miniChart', { read: BaseChartDirective }) chart?: BaseChartDirective;

  chartData!: ChartData<'line'>;
  chartOptions!: ChartOptions<'line'>;
  chartLabel!: string;

  ngOnInit(): void {
    this.applyConfig();
    this.updateChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.chartData || !this.chartOptions) return;

    if (changes['config']) {
      this.applyConfig();
    }

    if (changes['frames'] || changes['config']) {
      this.updateChart();
    }
  }

  ngOnDestroy(): void {
    this.chart?.chart?.destroy();
  }

  private applyConfig(): void {
    this.chartLabel = MINI_CHART_LABELS[this.config];
    this.chartData = makeMiniLineData(this.chartLabel, MINI_CHART_COLORS[this.config]);
    this.chartOptions = MINI_CHART_OPTIONS[this.config];
  }

  private updateChart(): void {
    const visibleFrames = this.frames.slice(-WINDOW);
    this.chartData.labels = visibleFrames.map((_, i) => String(i));
    this.chartData.datasets[0].data = visibleFrames.map(frame => this.extractValue(frame));
    this.chart?.chart?.update('none');
  }

  private extractValue(frame: ObdLiveFrame): number {
    switch (this.config) {
      case 'idle':
      case 'rev':
        return frame.rpm;
      case 'warmup':
        return frame.coolantTemp;
    }
  }
}
