import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GuidedTest, GuidedTestService, GuidedTestResult } from '../../core/diagnostics/guided-test.service';
import { idleStabilityTest } from '../../core/diagnostics/guided-tests/idle-stability.test';
import { revTest } from '../../core/diagnostics/guided-tests/rev-test.test';
import { warmupTest } from '../../core/diagnostics/guided-tests/warmup-test.test';
import { FuelTrimTestPanelComponent } from './components/fuel-trim-test-panel/fuel-trim-test-panel.component';
import { DeepDiagnosisService, DeepDiagnosisState } from '../../core/diagnostics/deep-diagnosis.service';
import { ObdAdapter, OBD_ADAPTER } from '../../core/adapters/obd-adapter.interface';
import { Inject } from '@angular/core';

@Component({
  selector: 'app-guided-tests-page',
  standalone: true,
  imports: [CommonModule, FuelTrimTestPanelComponent],
  templateUrl: './guided-tests-page.component.html',
  styleUrls: ['./guided-tests-page.component.scss']
})
export class GuidedTestsPageComponent {
  public isRunning$: Observable<boolean>;
  public progress$: Observable<number>;
  public result$: Observable<GuidedTestResult | null>;
  public activeTestId: string | null = null;

  public deepState$: Observable<DeepDiagnosisState>;
  public deepResult$: Observable<GuidedTestResult | null>;
  public connectionStatus$: Observable<string>;
  public fullDiagnosisActive$: Observable<boolean>;

  public readonly tests: Array<{ test: GuidedTest; instruction: string }> = [
    {
      test: idleStabilityTest,
      instruction: 'Start engine and let it idle for 10 seconds.'
    },
    {
      test: revTest,
      instruction: 'Raise RPM during the test window so engine response can be evaluated.'
    },
    {
      test: warmupTest,
      instruction: 'Start from a cool engine and let it warm up for 2 minutes.'
    }
  ];

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
}
