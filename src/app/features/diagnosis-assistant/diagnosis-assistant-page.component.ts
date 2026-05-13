import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf, NgFor, NgClass, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, combineLatest } from 'rxjs';
import { map, throttleTime } from 'rxjs/operators';
import { DeepDiagnosisService } from '../../core/diagnostics/deep-diagnosis.service';
import { CylinderAnalysisService } from '../../core/diagnostics/cylinder-analysis.service';
import type { CylinderAnalysisResult } from '../../core/diagnostics/cylinder-analysis.service';
import { CatalyticConverterAnalysisService } from '../../core/diagnostics/catalytic-converter-analysis.service';
import type { CatalyticConverterResult } from '../../core/diagnostics/catalytic-converter-analysis.service';
import { O2SensorBufferService } from '../../core/diagnostics/o2-sensor-buffer.service';
import { O2SensorGraphComponent } from '../../shared/components/o2-sensor-graph/o2-sensor-graph.component';

@Component({
  selector: 'app-diagnosis-assistant-page',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, TitleCasePipe, O2SensorGraphComponent],
  templateUrl: './diagnosis-assistant-page.component.html',
  styleUrls: ['./diagnosis-assistant-page.component.scss'],
})
export class DiagnosisAssistantPageComponent {
  private router              = inject(Router);
  private deepDiagnosis       = inject(DeepDiagnosisService);
  private cylinderAnalysis    = inject(CylinderAnalysisService);
  private catalyticAnalysis   = inject(CatalyticConverterAnalysisService);
  private o2Buffer            = inject(O2SensorBufferService);

  /** Live cylinder analysis derived from the current session's DTCs. */
  readonly cylinderResult$: Observable<CylinderAnalysisResult> =
    this.deepDiagnosis.state$.pipe(
      map(state => this.cylinderAnalysis.analyse(state.dtcCodes ?? []))
    );

  /**
   * Catalytic converter analysis combining DTC codes with live O2 sensor data
   * from the rolling 60-second buffer (Bank 1). Throttled to 500 ms to avoid
   * excessive re-renders at 5 Hz frame rate.
   */
  readonly catalyticResult$: Observable<CatalyticConverterResult> = combineLatest([
    this.deepDiagnosis.state$,
    this.o2Buffer.state$,
  ]).pipe(
    throttleTime(500, undefined, { leading: true, trailing: true }),
    map(([diagState]) => this.catalyticAnalysis.analyse({
      dtcCodes:  diagState.dtcCodes ?? [],
      o2Sensors: this.o2Buffer.buildCatalyticO2Input(1),
    })),
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
    if (status === 'normal')              return 'cat-status-badge--normal';
    if (status === 'mildly_degraded')     return 'cat-status-badge--warning';
    if (status === 'severely_degraded')   return 'cat-status-badge--critical';
    if (status === 'likely_missing')      return 'cat-status-badge--critical';
    if (status === 'possibly_restricted') return 'cat-status-badge--warning';
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
