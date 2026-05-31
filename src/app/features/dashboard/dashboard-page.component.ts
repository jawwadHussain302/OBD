import { Component, Inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { filter, distinctUntilChanged, take } from 'rxjs/operators';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ObdAdapter, OBD_ADAPTER, ObdDebugInfo } from '../../core/adapters/obd-adapter.interface';
import { AdapterSwitcherService, AdapterMode } from '../../core/adapters/adapter-switcher.service';
import { DiagnosticEngineService } from '../../core/diagnostics/diagnostic-engine.service';
import { SessionReplayService } from '../../core/replay/session-replay.service';
import { LiveTelemetryService } from '../../core/telemetry/live-telemetry.service';
import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';
import { DiagnosticResult } from '../../core/models/diagnostic-result.model';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card.component';
import { MultiSignalChartComponent } from '../../shared/components/multi-signal-chart/multi-signal-chart.component';
import { SignalValidator } from '../../core/utils/signal-validator';
import { MetricStatus } from '../../shared/components/metric-card/metric-card.component';

interface LiveMetricDefinition {
  id: 'rpm' | 'coolantTemp' | 'maf' | 'stftB1' | 'ltftB1' | 'throttlePosition';
  label: string;
  unit: string;
  gaugeMin: number;
  gaugeMax: number;
}

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
  imports: [CommonModule, TitleCasePipe, MetricCardComponent, BaseChartDirective, MultiSignalChartComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss']
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  public latestFrame: ObdLiveFrame | null = null;
  public connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'>;
  public debugInfo$: Observable<ObdDebugInfo> | undefined;
  public diagnosticResults: DiagnosticResult[] = [];
  public dataState: 'no_data' | 'receiving' = 'no_data';
  public frames: ObdLiveFrame[] = [];
  public connectionMessage = '';
  public readonly metricDefinitions: readonly LiveMetricDefinition[] = [
    { id: 'rpm', label: 'Engine Speed', unit: 'RPM', gaugeMin: 0, gaugeMax: 6000 },
    { id: 'coolantTemp', label: 'Coolant Temp', unit: '°C', gaugeMin: 0, gaugeMax: 120 },
    { id: 'maf', label: 'Mass Air Flow', unit: 'g/s', gaugeMin: 0, gaugeMax: 30 },
    { id: 'stftB1', label: 'STFT B1', unit: '%', gaugeMin: -25, gaugeMax: 25 },
    { id: 'ltftB1', label: 'LTFT B1', unit: '%', gaugeMin: -25, gaugeMax: 25 },
    { id: 'throttlePosition', label: 'Throttle', unit: '%', gaugeMin: 0, gaugeMax: 100 }
  ];

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

  private frameCount = 0;
  private lastFrameTimestamp: number | null = null;
  private subscriptions = new Subscription();

  constructor(
    @Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter,
    private diagnosticEngine: DiagnosticEngineService,
    private adapterSwitcher: AdapterSwitcherService,
    private replayService: SessionReplayService,
    private telemetryService: LiveTelemetryService,
  ) {
    this.connectionStatus$ = this.obdAdapter.connectionStatus$;
    this.debugInfo$ = this.obdAdapter.debug$;
  }

  public ngOnInit(): void {
    this.diagnosticEngine.startSession();
    this.adapterMode = this.adapterSwitcher.getMode();

    const restoreSubscription = this.telemetryService.frameHistory$.pipe(take(1)).subscribe({
      next: history => this.restoreFromTelemetryHistory(history)
    });

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

    // Reset display state when adapter disconnects so the UI doesn't show stale data
    const disconnectSubscription = this.obdAdapter.connectionStatus$.pipe(
      distinctUntilChanged(),
      filter(status => status === 'disconnected' || status === 'error')
    ).subscribe(() => {
      this.latestFrame = null;
      this.dataState = 'no_data';
    });

    this.subscriptions.add(dataSubscription);
    this.subscriptions.add(diagSubscription);
    this.subscriptions.add(modeSubscription);
    this.subscriptions.add(disconnectSubscription);
    this.subscriptions.add(restoreSubscription);
  }

  public ngOnDestroy(): void {
    this.ltftChart?.chart?.destroy();
    // Keep the live diagnostic session in the service so route changes do not
    // reset active Live Data state.
    this.persistSession();
    this.subscriptions.unsubscribe();
  }

  // ─── Adapter / mode control ───────────────────────────────────────────────

  public connectAdapter(): void {
    this.obdAdapter.connect().catch(() => {
      this.connectionMessage = this.adapterMode === 'real' && !this.browserSupportsWebBluetooth()
        ? 'This browser does not support Web Bluetooth.'
        : 'Unable to connect to the OBD adapter. Check power, pairing, and adapter compatibility.';
    });
  }

  public disconnectAdapter(): void {
    this.connectionMessage = 'OBD adapter disconnected.';
    this.obdAdapter.disconnect();
  }

  public async toggleSimulatorMode(): Promise<void> {
    const next: AdapterMode = this.adapterMode === 'simulated' ? 'real' : 'simulated';
    this.persistSession();
    this.clearCharts();
    this.connectionMessage = '';
    await this.adapterSwitcher.setMode(next);
    // Auto-connect the simulator when switching to it
    if (next === 'simulated') {
      this.obdAdapter.connect().catch(() => {});
    }
  }

  public clearCharts(): void {
    this.persistSession();
    this.frames = [];
    this.frameCount = 0;
    this.lastFrameTimestamp = null;
    this.dataState = 'no_data';
    this.diagnosticResults = [];
    this.telemetryService.clearHistory();
    this.diagnosticEngine.resetSession();

    this.ltftChartData.labels = [];
    this.ltftChartData.datasets[0].data = [];
    this.ltftChart?.chart?.update();
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private handleNewFrame(rawFrame: ObdLiveFrame): void {
    const frame = SignalValidator.sanitizeFrame(rawFrame);
    if (this.lastFrameTimestamp === frame.timestamp) {
      return;
    }

    this.lastFrameTimestamp = frame.timestamp;
    this.latestFrame = frame;
    this.dataState = 'receiving';
    this.connectionMessage = '';

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

  private restoreFromTelemetryHistory(history: readonly ObdLiveFrame[]): void {
    const restoredFrames = history.slice(-60).map(frame => SignalValidator.sanitizeFrame(frame));
    if (restoredFrames.length === 0) {
      return;
    }

    this.frames = restoredFrames;
    this.frameCount = restoredFrames.length;
    this.latestFrame = restoredFrames[restoredFrames.length - 1];
    this.lastFrameTimestamp = this.latestFrame.timestamp;
    this.dataState = 'receiving';
    this.diagnosticEngine.restoreSession(restoredFrames);
    this.updateDetailChart();
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

  public browserSupportsWebBluetooth(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public metricValue(id: LiveMetricDefinition['id']): string {
    if (!this.latestFrame) {
      return 'No data yet';
    }

    switch (id) {
      case 'rpm':
        return this.latestFrame.rpm.toFixed(0);
      case 'coolantTemp':
        return this.latestFrame.coolantTemp.toFixed(0);
      case 'maf':
        return this.latestFrame.maf === undefined ? 'No data yet' : this.latestFrame.maf.toFixed(2);
      case 'stftB1':
        return this.latestFrame.stftB1.toFixed(1);
      case 'ltftB1':
        return this.latestFrame.ltftB1.toFixed(1);
      case 'throttlePosition':
        return this.latestFrame.throttlePosition.toFixed(0);
    }
  }

  public metricGaugeValue(id: LiveMetricDefinition['id']): number {
    if (!this.latestFrame) {
      return 0;
    }

    switch (id) {
      case 'rpm':
        return this.latestFrame.rpm;
      case 'coolantTemp':
        return this.latestFrame.coolantTemp;
      case 'maf':
        return this.latestFrame.maf ?? 0;
      case 'stftB1':
        return this.latestFrame.stftB1;
      case 'ltftB1':
        return this.latestFrame.ltftB1;
      case 'throttlePosition':
        return this.latestFrame.throttlePosition;
    }
  }

  public metricStatus(id: LiveMetricDefinition['id']): MetricStatus {
    if (!this.latestFrame) {
      return 'none';
    }

    if (id === 'coolantTemp') {
      return this.latestFrame.coolantTemp >= 90 ? 'nominal' : 'none';
    }

    if (id === 'maf') {
      return this.latestFrame.maf === undefined ? 'none' : 'live';
    }

    return this.dataState === 'receiving' ? 'live' : 'none';
  }

  public metricBadge(id: LiveMetricDefinition['id']): string {
    if (!this.latestFrame) {
      return '';
    }

    if (id === 'rpm') {
      return 'LIVE';
    }

    if (id === 'stftB1') {
      return (this.latestFrame.stftB1 | 0) !== 0 ? 'ACTIVE' : '';
    }

    return '';
  }
}
