import { Component, Input, OnInit, OnDestroy, ViewChild, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Subscription } from 'rxjs';
import { ObdAdapter, OBD_ADAPTER } from '../../../core/adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../../../core/models/obd-live-frame.model';
import {
  MiniGraphConfig,
  makeMiniLineData,
  MINI_CHART_OPTIONS,
  MINI_CHART_COLORS,
  MINI_CHART_LABELS
} from '../../chart-configs/mini-chart-configs';

@Component({
  selector: 'app-mini-graph',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './mini-graph.component.html',
  styleUrls: ['./mini-graph.component.scss']
})
export class MiniGraphComponent implements OnInit, OnDestroy {
  @Input() config: MiniGraphConfig = 'idle';
  @ViewChild('miniChart', { read: BaseChartDirective }) chart?: BaseChartDirective;

  chartData!: ChartData<'line'>;
  chartOptions!: ChartOptions<'line'>;
  chartLabel!: string;

  private frames: ObdLiveFrame[] = [];
  private frameCount = 0;
  private sub!: Subscription;

  constructor(@Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter) {}

  ngOnInit(): void {
    this.chartLabel = MINI_CHART_LABELS[this.config];
    this.chartData = makeMiniLineData(this.chartLabel, MINI_CHART_COLORS[this.config]);
    this.chartOptions = MINI_CHART_OPTIONS[this.config];
    this.sub = this.obdAdapter.data$.subscribe(frame => this.handleFrame(frame));
  }

  ngOnDestroy(): void {
    this.chart?.chart?.destroy();
    this.sub.unsubscribe();
  }

  private handleFrame(frame: ObdLiveFrame): void {
    this.frames.push(frame);
    if (this.frames.length > 20) this.frames.shift();
    this.frameCount++;
    if (this.frameCount % 2 === 0) this.updateChart();
  }

  private updateChart(): void {
    this.chartData.labels = this.frames.map((_, i) => String(i));
    this.chartData.datasets[0].data = this.frames.map(f => this.extractValue(f));
    this.chart?.chart?.update();
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
