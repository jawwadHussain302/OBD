import { Component, OnInit, OnDestroy, ViewChild, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { map, scan } from 'rxjs/operators';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { GuidedTest, GuidedTestService, GuidedTestResult } from '../../core/diagnostics/guided-test.service';
import { idleStabilityTest } from '../../core/diagnostics/guided-tests/idle-stability.test';
import { revTest } from '../../core/diagnostics/guided-tests/rev-test.test';
import { warmupTest } from '../../core/diagnostics/guided-tests/warmup-test.test';
import { FuelTrimTestPanelComponent } from './components/fuel-trim-test-panel/fuel-trim-test-panel.component';
import { DtcCodeCardComponent } from '../../shared/dtc-code-card/dtc-code-card.component';
import { MiniGraphComponent } from '../../shared/components/mini-graph/mini-graph.component';
import { MiniGraphConfig } from '../../shared/chart-configs/mini-chart-configs';
import { DeepDiagnosisService, DeepDiagnosisState, DiagnosisStepId } from '../../core/diagnostics/deep-diagnosis.service';
import { ObdAdapter, OBD_ADAPTER } from '../../core/adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';

export interface LiveMetricView {
  rpm: { value: number; interpretation: string };
  coolant: { value: number; interpretation: string };
  stft: { value: number; interpretation: string };
  ltft: { value: number; interpretation: string };
  load: { value: number };
  throttle: { value: number };
  maf?: { value: number };
}

interface StepChartConfig {
  label: string;
  color: string;
  yMin: number;
  yMax: number;
  extract: (f: ObdLiveFrame) => number;
}

@Component({
  selector: 'app-guided-tests-page',
  standalone: true,
  imports: [CommonModule, FuelTrimTestPanelComponent, DtcCodeCardComponent, MiniGraphComponent, BaseChartDirective],
  templateUrl: './guided-tests-page.component.html',
  styleUrls: ['./guided-tests-page.component.scss']
})
export class GuidedTestsPageComponent implements OnInit, OnDestroy {
  public isRunning$: Observable<boolean>;
  public progress$: Observable<number>;
  public result$: Observable<GuidedTestResult | null>;
  public activeTestId: string | null = null;

  public deepState$: Observable<DeepDiagnosisState>;
  public deepResult$: Observable<GuidedTestResult | null>;
  public connectionStatus$: Observable<string>;
  public fullDiagnosisActive$: Observable<boolean>;
  public liveMetrics$: Observable<LiveMetricView>;

  // Mini chart state
  public showMiniChart = false;
  public chartLabel = '';
  public chartData: ChartData<'line'> = {
    labels: [],
    datasets: [{
      label: '',
      data: [],
      borderColor: '#4CAF50',
      backgroundColor: '#4CAF5022',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2
    }]
  };
  public chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: {
        min: 0,
        max: 1500,
        grid: { color: '#333333' },
        ticks: { color: '#cccccc', maxTicksLimit: 4 }
      }
    }
  };

  @ViewChild('diagChart', { read: BaseChartDirective }) private diagChart?: BaseChartDirective;

  public readonly tests: Array<{ test: GuidedTest; instruction: string; chartConfig?: MiniGraphConfig }> = [
    {
      test: idleStabilityTest,
      instruction: 'Start engine and let it idle for 10 seconds.',
      chartConfig: 'idle'
    },
    {
      test: revTest,
      instruction: 'Raise RPM during the test window so engine response can be evaluated.',
      chartConfig: 'rev'
    }
  ];

  private chartFrames: ObdLiveFrame[] = [];
  private chartFrameCount = 0;
  private lastChartStep: DiagnosisStepId | null = null;
  private currentExtract: ((f: ObdLiveFrame) => number) | null = null;
  private subs = new Subscription();

  private static readonly STEP_CHART_CONFIGS: Partial<Record<DiagnosisStepId, StepChartConfig>> = {
    warmup_monitoring: { label: 'Coolant °C', color: '#ff9800', yMin: 0,    yMax: 120,  extract: f => f.coolantTemp },
    idle_test:         { label: 'RPM',             color: '#4CAF50', yMin: 0,    yMax: 1500, extract: f => f.rpm },
    rev_test:          { label: 'RPM',             color: '#2196F3', yMin: 0,    yMax: 4000, extract: f => f.rpm }
  };

  constructor(
    private guidedTestService: GuidedTestService,
    private deepDiagnosisService: DeepDiagnosisService,
    @Inject(OBD_ADAPTER) private obdAdapter: ObdAdapter
  ) {
    this.isRunning$ = this.guidedTestService.isRunning$;
    this.progress$ = this.guidedTestService.progress$;
    this.result$ = this.guidedTestService.result$;

    this.deepState$ = this.deepDiagnosisService.state$;
    this.deepResult$ = this.deepDiagnosisService.finalResult$;
    this.connectionStatus$ = this.obdAdapter.connectionStatus$;
    this.fullDiagnosisActive$ = this.deepState$.pipe(
      map(state => state.status === 'running' || state.status === 'transitioning')
    );

    this.liveMetrics$ = this.obdAdapter.data$.pipe(
      scan((acc, frame) => {
        const rpmHistory = [...acc.rpmHistory, frame.rpm].slice(-5);
        const rpmDiff = Math.max(...rpmHistory) - Math.min(...rpmHistory);
        const rpmInterpretation = rpmHistory.length >= 5 && rpmDiff <= 50 ? 'Stable' : 'Changing';

        let coolantInterpretation = 'Cold';
        if (frame.coolantTemp >= 75) coolantInterpretation = 'Warm';
        else if (frame.coolantTemp >= 50) coolantInterpretation = 'Warming';

        const getTrimInterpretation = (trim: number) => {
          if (trim > 10) return 'Lean tendency';
          if (trim < -10) return 'Rich tendency';
          return 'Normal';
        };

        return {
          rpmHistory,
          display: {
            rpm: { value: frame.rpm, interpretation: rpmInterpretation },
            coolant: { value: frame.coolantTemp, interpretation: coolantInterpretation },
            stft: { value: frame.stftB1, interpretation: getTrimInterpretation(frame.stftB1) },
            ltft: { value: frame.ltftB1, interpretation: getTrimInterpretation(frame.ltftB1) },
            load: { value: frame.engineLoad },
            throttle: { value: frame.throttlePosition },
            maf: frame.maf !== undefined ? { value: frame.maf } : undefined
          } as LiveMetricView
        };
      }, { rpmHistory: [] as number[], display: null as unknown as LiveMetricView }),
      map(state => state.display)
    );
  }

  public ngOnInit(): void {
    this.subs.add(
      this.deepState$.subscribe(state => {
        const isActive = state.status === 'running' || state.status === 'transitioning';
        if (!isActive) {
          this.showMiniChart = false;
          this.currentExtract = null;
          this.lastChartStep = null;
          return;
        }

        const config = GuidedTestsPageComponent.STEP_CHART_CONFIGS[state.currentStep];
        if (!config) {
          this.showMiniChart = false;
          this.currentExtract = null;
          return;
        }

        if (state.currentStep !== this.lastChartStep) {
          this.lastChartStep = state.currentStep;
          this.applyStepConfig(config);
          this.showMiniChart = true;
        }
      })
    );

    this.subs.add(
      this.obdAdapter.data$.subscribe(frame => {
        if (!this.showMiniChart || !this.currentExtract) return;
        this.chartFrames.push(frame);
        if (this.chartFrames.length > 20) this.chartFrames.shift();
        this.chartFrameCount++;
        if (this.chartFrameCount % 2 === 0) this.updateMiniChart();
      })
    );
  }

  public ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  public startGuidedTest(test: GuidedTest): void {
    this.activeTestId = test.id;
    this.guidedTestService.startTest(test);
  }

  public stopTest(): void {
    this.guidedTestService.stopTest();
    this.activeTestId = null;
  }

  public startFullDiagnosis(): void {
    this.deepDiagnosisService.startDiagnosis();
  }

  public cancelFullDiagnosis(): void {
    this.deepDiagnosisService.cancelDiagnosis();
  }

  public moveNow(): void {
    this.deepDiagnosisService.moveNow();
  }

  public stayOnCurrentStep(): void {
    this.deepDiagnosisService.stayOnCurrentStep();
  }

  public completeWithoutDriving(): void {
    this.deepDiagnosisService.completeWithoutDriving();
  }

  private applyStepConfig(config: StepChartConfig): void {
    this.chartLabel = config.label;
    this.currentExtract = config.extract;
    this.chartFrames = [];
    this.chartFrameCount = 0;

    // Mutate dataset in place — avoids chart recreation on step change
    const ds = this.chartData.datasets[0];
    ds.borderColor = config.color;
    ds.backgroundColor = config.color + '22';
    ds.label = config.label;
    ds.data = [];
    this.chartData.labels = [];

    // Reassign options reference so ng2-charts updates Y-axis bounds
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          min: config.yMin,
          max: config.yMax,
          grid: { color: '#333333' },
          ticks: { color: '#cccccc', maxTicksLimit: 4 }
        }
      }
    };
  }

  private updateMiniChart(): void {
    this.chartData.labels = this.chartFrames.map((_, i) => String(i));
    this.chartData.datasets[0].data = this.chartFrames.map(f => this.currentExtract!(f));
    this.diagChart?.chart?.update('none');
  }
}
