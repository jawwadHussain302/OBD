import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { GuidedTestService, GuidedTestResult } from '../../core/diagnostics/guided-test.service';
import { idleStabilityTest } from '../../core/diagnostics/guided-tests/idle-stability.test';

@Component({
  selector: 'app-guided-tests-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guided-tests-page.component.html',
  styleUrls: ['./guided-tests-page.component.scss']
})
export class GuidedTestsPageComponent {
  public isRunning$: Observable<boolean>;
  public progress$: Observable<number>;
  public result$: Observable<GuidedTestResult | null>;

  constructor(private guidedTestService: GuidedTestService) {
    this.isRunning$ = this.guidedTestService.isRunning$;
    this.progress$ = this.guidedTestService.progress$;
    this.result$ = this.guidedTestService.result$;
  }

  public startIdleStabilityTest(): void {
    this.guidedTestService.startTest(idleStabilityTest);
  }

  public stopTest(): void {
    this.guidedTestService.stopTest();
  }
}
