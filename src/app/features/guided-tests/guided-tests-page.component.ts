import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { GuidedTest, GuidedTestService, GuidedTestResult } from '../../core/diagnostics/guided-test.service';
import { idleStabilityTest } from '../../core/diagnostics/guided-tests/idle-stability.test';
import { revTest } from '../../core/diagnostics/guided-tests/rev-test.test';
import { FuelTrimTestPanelComponent } from './components/fuel-trim-test-panel/fuel-trim-test-panel.component';
import { MiniGraphComponent, } from '../../shared/components/mini-graph/mini-graph.component';
import { MiniGraphConfig } from '../../shared/chart-configs/mini-chart-configs';

@Component({
  selector: 'app-guided-tests-page',
  standalone: true,
  imports: [CommonModule, FuelTrimTestPanelComponent, MiniGraphComponent],
  templateUrl: './guided-tests-page.component.html',
  styleUrls: ['./guided-tests-page.component.scss']
})
export class GuidedTestsPageComponent {
  public isRunning$: Observable<boolean>;
  public progress$: Observable<number>;
  public result$: Observable<GuidedTestResult | null>;
  public activeTestId: string | null = null;

  public readonly tests: Array<{ test: GuidedTest; instruction: string; chartConfig: MiniGraphConfig }> = [
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

  constructor(private guidedTestService: GuidedTestService) {
    this.isRunning$ = this.guidedTestService.isRunning$;
    this.progress$ = this.guidedTestService.progress$;
    this.result$ = this.guidedTestService.result$;
  }

  public startGuidedTest(test: GuidedTest): void {
    this.activeTestId = test.id;
    this.guidedTestService.startTest(test);
  }

  public stopTest(): void {
    this.guidedTestService.stopTest();
    this.activeTestId = null;
  }
}
