import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf, NgFor, NgClass, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import { DeepDiagnosisService } from '../../core/diagnostics/deep-diagnosis.service';
import { CylinderAnalysisService } from '../../core/diagnostics/cylinder-analysis.service';
import type { CylinderAnalysisResult } from '../../core/diagnostics/cylinder-analysis.service';
import { CatalyticConverterAnalysisService } from '../../core/diagnostics/catalytic-converter-analysis.service';
import type { CatalyticConverterResult } from '../../core/diagnostics/catalytic-converter-analysis.service';

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
  private catalyticAnalysis   = inject(CatalyticConverterAnalysisService);

  /** Live cylinder analysis derived from the current session's DTCs. */
  readonly cylinderResult$: Observable<CylinderAnalysisResult> =
    this.deepDiagnosis.state$.pipe(
      map(state => this.cylinderAnalysis.analyse(state.dtcCodes ?? []))
    );

  /** Catalytic converter analysis derived from the current session's DTCs. */
  readonly catalyticResult$: Observable<CatalyticConverterResult> =
    this.deepDiagnosis.state$.pipe(
      map(state => this.catalyticAnalysis.analyse({ dtcCodes: state.dtcCodes ?? [] }))
    );

  showCylinderPanel  = false;
  showCatalyticPanel = false;

  openFullDiagnosis(): void {
    this.router.navigate(['/diagnosis-report']);
  }

  openGuidedDiagnosis(): void {
    this.router.navigate(['/guided-tests']);
  }

  toggleCylinderAnalysis(): void {
    this.showCylinderPanel = !this.showCylinderPanel;
  }

  toggleCatalyticAnalysis(): void {
    this.showCatalyticPanel = !this.showCatalyticPanel;
  }

  catalyticStatusClass(status: string): string {
    if (status === 'normal')              return 'cat-badge--normal';
    if (status === 'mildly_degraded')     return 'cat-badge--warning';
    if (status === 'severely_degraded')   return 'cat-badge--critical';
    if (status === 'likely_missing')      return 'cat-badge--critical';
    if (status === 'possibly_restricted') return 'cat-badge--warning';
    return '';
  }

  catalyticStatusLabel(status: string): string {
    if (status === 'normal')              return 'Normal';
    if (status === 'mildly_degraded')     return 'Mild Degradation';
    if (status === 'severely_degraded')   return 'Severely Degraded';
    if (status === 'likely_missing')      return 'Likely Missing';
    if (status === 'possibly_restricted') return 'Possibly Restricted';
    return status;
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
