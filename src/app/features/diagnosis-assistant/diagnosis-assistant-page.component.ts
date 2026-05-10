import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf, NgFor, NgClass, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import { DeepDiagnosisService } from '../../core/diagnostics/deep-diagnosis.service';
import { CylinderAnalysisService, CylinderAnalysisResult } from '../../core/diagnostics/cylinder-analysis.service';

@Component({
  selector: 'app-diagnosis-assistant-page',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, TitleCasePipe],
  templateUrl: './diagnosis-assistant-page.component.html',
  styleUrls: ['./diagnosis-assistant-page.component.scss'],
})
export class DiagnosisAssistantPageComponent {
  private router              = inject(Router);
  private deepDiagnosis       = inject(DeepDiagnosisService);
  private cylinderAnalysis    = inject(CylinderAnalysisService);

  /** Live cylinder analysis derived from the current session's DTCs. */
  readonly cylinderResult$: Observable<CylinderAnalysisResult> =
    this.deepDiagnosis.state$.pipe(
      map(state => this.cylinderAnalysis.analyse(state.dtcCodes ?? []))
    );

  showCylinderPanel = false;

  openFullDiagnosis(): void {
    this.router.navigate(['/diagnosis-report']);
  }

  openGuidedDiagnosis(): void {
    this.router.navigate(['/guided-tests']);
  }

  toggleCylinderAnalysis(): void {
    this.showCylinderPanel = !this.showCylinderPanel;
  }

  readonly CAUSE_LABELS: Record<string, string> = {
    ignition_coil_issue: 'Ignition coil failure',
    spark_plug_issue:    'Spark plug fault',
    injector_issue:      'Injector malfunction',
    wiring_or_ecu_issue: 'Wiring / ECU driver fault',
    compression_issue:   'Low compression (mechanical)',
    intake_leak_issue:   'Intake / vacuum leak',
  };

  readonly NEXT_TEST_LABELS: Record<string, string> = {
    ignition_coil_swap: 'Ignition Coil Swap Test',
    fuel_pressure_test: 'Fuel Pressure Test',
  };
}
