import { Component, inject } from '@angular/core';
import { AsyncPipe, NgClass, NgFor, NgIf, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { DeepDiagnosisService } from '../../core/diagnostics/deep-diagnosis.service';
import { CylinderAnalysisService } from '../../core/diagnostics/cylinder-analysis.service';

@Component({
  selector: 'app-cylinder-analysis-page',
  standalone: true,
  imports: [AsyncPipe, NgClass, NgFor, NgIf, TitleCasePipe],
  templateUrl: './cylinder-analysis-page.component.html',
  styleUrls: ['./cylinder-analysis-page.component.scss'],
})
export class CylinderAnalysisPageComponent {
  private router = inject(Router);
  private deepDiagnosis = inject(DeepDiagnosisService);
  private cylinderAnalysis = inject(CylinderAnalysisService);

  readonly cylinderResult$ = this.deepDiagnosis.state$.pipe(
    map(state => this.cylinderAnalysis.analyse(state.dtcCodes ?? [])),
  );

  readonly CAUSE_LABELS: Record<string, string> = {
    ignition_coil_issue: 'Ignition coil failure',
    spark_plug_issue: 'Spark plug fault',
    injector_issue: 'Injector malfunction',
    wiring_or_ecu_issue: 'Wiring / ECU driver fault',
    compression_issue: 'Low compression (mechanical)',
    intake_leak_issue: 'Intake / vacuum leak',
  };

  readonly NEXT_TEST_LABELS: Record<string, string> = {
    ignition_coil_swap: 'Ignition Coil Swap Test',
    fuel_pressure_test: 'Fuel Pressure Test',
  };

  backToHub(): void {
    this.router.navigate(['/diagnosis-assistant']);
  }
}
