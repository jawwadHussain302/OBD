import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { MockObdAdapterService, MockMode } from '../../core/adapters/mock-obd-adapter.service';
import { DiagnosticEngineService } from '../../core/diagnostics/diagnostic-engine.service';
import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';
import { DiagnosticResult } from '../../core/models/diagnostic-result.model';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card.component';

function makeLineData(label: string, color: string): ChartData<'line'> {
  return {
    labels: [],
    datasets: [{
      label,
      data: [],
      borderColor: color,
      backgroundColor: color + '22',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2
    }]
  };
}

const BASE_CHART_OPTIONS: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { display: false },
    y: {
      grid: { color: '#333333' },
      ticks: { color: '#cccccc', maxTicksLimit: 5 }
    }
  }
};

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, MetricCardComponent, BaseChartDirective],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss']
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  public latestFrame: ObdLiveFrame | null = null;
  public connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'>;
  public diagnosticResults: DiagnosticResult[] = [];
  public dataState: 'no_data' | 'receiving' = 'no_data';

  public rpmChartData: ChartData<'line'> = makeLineData('RPM', '#4CAF50');
  public stftChartData: ChartData<'line'> = makeLineData('STFT B1 %', '#2196F3');
  public ltftChartData: ChartData<'line'> = makeLineData('LTFT B1 %', '#ff9800');

  public readonly chartOptions: ChartOptions<'line'> = BASE_CHART_OPTIONS;

  public readonly fuelTrimOptions: ChartOptions<'line'> = {
    ...BASE_CHART_OPTIONS,
    scales: {
      x: { display: false },
      y: {
        min: -25,
        max: 25,
        grid: { color: '#333333' },
        ticks: { color: '#cccccc', maxTicksLimit: 5 }
      }
    }
  };

  private frames: ObdLiveFrame[] = [];
  private subscriptions = new Subscription();

  constructor(
    private obdAdapter: MockObdAdapterService,
    private diagnosticEngine: DiagnosticEngineService
  ) {
    this.connectionStatus$ = this.obdAdapter.connectionStatus$;
  }

  public ngOnInit(): void {
    this.diagnosticEngine.startSession();
    this.obdAdapter.connect();

    const dataSubscription = this.obdAdapter.data$.subscribe({
      next: (frame: ObdLiveFrame) => this.handleNewFrame(frame)
    });

    const diagSubscription = this.diagnosticEngine.activeResults$.subscribe({
      next: (results: DiagnosticResult[]) => {
        this.diagnosticResults = this.deduplicateResults(results);
      }
    });

    this.subscriptions.add(dataSubscription);
    this.subscriptions.add(diagSubscription);
  }

  public ngOnDestroy(): void {
    this.diagnosticEngine.stopSession();
    this.subscriptions.unsubscribe();
  }

  public setMode(mode: string): void {
    this.frames = [];
    this.dataState = 'no_data';
    this.diagnosticResults = [];
    this.rpmChartData = makeLineData('RPM', '#4CAF50');
    this.stftChartData = makeLineData('STFT B1 %', '#2196F3');
    this.ltftChartData = makeLineData('LTFT B1 %', '#ff9800');
    this.obdAdapter.setMockMode(mode as MockMode);
  }

  private handleNewFrame(frame: ObdLiveFrame): void {
    this.latestFrame = frame;
    this.dataState = 'receiving';

    this.frames.push(frame);
    if (this.frames.length > 20) {
      this.frames.shift();
    }

    this.updateCharts();

    if (this.frames.length >= 5) {
      this.diagnosticEngine.processFrame(frame);
    }
  }

  private updateCharts(): void {
    const labels = this.frames.map((_, i) => i + 1);
    this.rpmChartData = {
      labels,
      datasets: [{ ...this.rpmChartData.datasets[0], data: this.frames.map(f => f.rpm) }]
    };
    this.stftChartData = {
      labels,
      datasets: [{ ...this.stftChartData.datasets[0], data: this.frames.map(f => f.stftB1) }]
    };
    this.ltftChartData = {
      labels,
      datasets: [{ ...this.ltftChartData.datasets[0], data: this.frames.map(f => f.ltftB1) }]
    };
  }

  private deduplicateResults(results: DiagnosticResult[]): DiagnosticResult[] {
    const uniqueMap = new Map<string, DiagnosticResult>();
    results.forEach(result => uniqueMap.set(result.issueId, result));
    return Array.from(uniqueMap.values());
  }
}
