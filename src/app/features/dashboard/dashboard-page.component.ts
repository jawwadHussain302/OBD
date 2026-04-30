import { Component, Inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ObdAdapter, OBD_ADAPTER, ObdDebugInfo } from '../../core/adapters/obd-adapter.interface';
import { AdapterSwitcherService, AdapterMode } from '../../core/adapters/adapter-switcher.service';
import { DiagnosticEngineService } from '../../core/diagnostics/diagnostic-engine.service';
import { SessionReplayService } from '../../core/replay/session-replay.service';
import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';
import { DiagnosticResult } from '../../core/models/diagnostic-result.model';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card.component';
import { MultiSignalChartComponent } from '../../shared/components/multi-signal-chart/multi-signal-chart.component';

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
  imports: [CommonModule, MetricCardComponent, BaseChartDirective, MultiSignalChartComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss']
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  public latestFrame: ObdLiveFrame | null = null;
  public connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'>;
  public debugInfo$: Observable<ObdDebugInfo> | undefined;
  public diagnosticResults: DiagnosticResult[] = [];
  public dataState: 'no_data' | 'receiving' = 'no_data';

  /** Current adapter mode for the template */
  public adapterMode: AdapterMode = 'simulated';

  // ─── Individual signal charts (kept for detail view) ─────────────────────
  public ltftChartData: ChartData<'line'> = makeLineData('LTFT B1 %', '#ff9800');

  @ViewChild('ltftChart', { read: BaseChartDirective }) ltftChart?: BaseChartDirective;

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
  private frameCount = 0;
  private subscriptions = new Subscription();

  constructor(
    @Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter,
    private diagnosticEngine: DiagnosticEngineService,
    private adapterSwitcher: AdapterSwitcherService,
    private replayService: SessionReplayService,
  ) {
    this.connectionStatus$ = this.obdAdapter.connectionStatus$;
    this.debugInfo$ = this.obdAdapter.debug$;
  }

  public ngOnInit(): void {
    this.diagnosticEngine.startSession();
    this.adapterMode = this.adapterSwitcher.getMode();

    const dataSubscription = this.obdAdapter.data$.subscribe({
      next: (frame: ObdLiveFrame) => this.handleNewFrame(frame)
    });

    const diagSubscription = this.diagnosticEngine.activeResults$.subscribe({
      next: (results: DiagnosticResult[]) => {
        this.diagnosticResults = this.deduplicateResults(results);
      }
    });

    const modeSubscription = this.adapterSwitcher.mode$.subscribe(mode => {
      this.adapterMode = mode;
    });

    this.subscriptions.add(dataSubscription);
    this.subscriptions.add(diagSubscription);
    this.subscriptions.add(modeSubscription);
  }

  public ngOnDestroy(): void {
    this.ltftChart?.chart?.destroy();
    this.diagnosticEngine.stopSession();
    this.persistSession();
    this.subscriptions.unsubscribe();
  }

  // ─── Adapter / mode control ───────────────────────────────────────────────

  public connectAdapter(): void {
    this.obdAdapter.connect().catch(() => {
      // DOMException or connection failure — connectionStatus$ reflects the error state
    });
  }

  public disconnectAdapter(): void {
    this.obdAdapter.disconnect();
  }

  public toggleSimulatorMode(): void {
    const next: AdapterMode = this.adapterMode === 'simulated' ? 'real' : 'simulated';
    this.persistSession();
    this.clearCharts();
    this.adapterSwitcher.setMode(next);
    // Auto-connect the simulator when switching to it
    if (next === 'simulated') {
      this.obdAdapter.connect().catch(() => {});
    }
  }

  public clearCharts(): void {
    this.persistSession();
    this.frames = [];
    this.frameCount = 0;
    this.dataState = 'no_data';
    this.diagnosticResults = [];

    this.ltftChartData.labels = [];
    this.ltftChartData.datasets[0].data = [];
    this.ltftChart?.chart?.update();
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private handleNewFrame(frame: ObdLiveFrame): void {
    this.latestFrame = frame;
    this.dataState = 'receiving';

    this.frames.push(frame);
    if (this.frames.length > 60) {
      this.frames.shift();
    }

    this.frameCount++;
    if (this.frameCount % 2 === 0) {
      this.updateDetailChart();
    }

    if (this.frames.length >= 5) {
      this.diagnosticEngine.processFrame(frame);
    }

    // Auto-save every 30 frames for session replay
    if (this.frameCount % 30 === 0) {
      this.persistSession();
    }
  }

  private updateDetailChart(): void {
    const labels = this.frames.map((_, i) => String(i + 1));

    this.ltftChartData.labels = labels;
    this.ltftChartData.datasets[0].data = this.frames.map(f => f.ltftB1);
    this.ltftChart?.chart?.update();
  }

  private persistSession(): void {
    if (this.frames.length > 0) {
      this.replayService.saveSession(this.frames, this.diagnosticResults);
    }
  }

  private deduplicateResults(results: DiagnosticResult[]): DiagnosticResult[] {
    const uniqueMap = new Map<string, DiagnosticResult>();
    results.forEach(result => uniqueMap.set(result.issueId, result));
    return Array.from(uniqueMap.values());
  }
}
