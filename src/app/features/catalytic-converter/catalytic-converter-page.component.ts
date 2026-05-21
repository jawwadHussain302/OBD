import { Component, inject } from '@angular/core';
import { AsyncPipe, NgClass, NgFor, NgIf, TitleCasePipe } from '@angular/common';
import { Observable, combineLatest } from 'rxjs';
import { map, throttleTime } from 'rxjs/operators';
import { DeepDiagnosisService } from '../../core/diagnostics/deep-diagnosis.service';
import { CatalyticConverterAnalysisService } from '../../core/diagnostics/catalytic-converter-analysis.service';
import type { CatalyticConverterResult } from '../../core/diagnostics/catalytic-converter-analysis.service';
import { O2SensorBufferService } from '../../core/diagnostics/o2-sensor-buffer.service';
import { O2SensorGraphComponent } from '../../shared/components/o2-sensor-graph/o2-sensor-graph.component';

@Component({
  selector: 'app-catalytic-converter-page',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, TitleCasePipe, O2SensorGraphComponent],
  templateUrl: './catalytic-converter-page.component.html',
  styleUrls: ['./catalytic-converter-page.component.scss'],
})
export class CatalyticConverterPageComponent {
  private readonly deepDiagnosis = inject(DeepDiagnosisService);
  private readonly catalyticAnalysis = inject(CatalyticConverterAnalysisService);
  private readonly o2Buffer = inject(O2SensorBufferService);

  readonly result$: Observable<CatalyticConverterResult> = combineLatest([
    this.deepDiagnosis.state$,
    this.o2Buffer.state$,
  ]).pipe(
    throttleTime(500, undefined, { leading: true, trailing: true }),
    map(([diagState]) => this.catalyticAnalysis.analyse({
      dtcCodes: diagState.dtcCodes ?? [],
      o2Sensors: this.o2Buffer.buildCatalyticO2Input(1),
    })),
  );

  statusClass(status: string): string {
    if (status === 'normal') return 'status--normal';
    if (status === 'mildly_degraded' || status === 'possibly_restricted') return 'status--warning';
    if (status === 'severely_degraded' || status === 'likely_missing') return 'status--critical';
    return '';
  }

  statusLabel(status: string): string {
    if (status === 'normal') return 'Normal';
    if (status === 'mildly_degraded') return 'Mild Degradation';
    if (status === 'severely_degraded') return 'Severely Degraded';
    if (status === 'likely_missing') return 'Likely Missing';
    if (status === 'possibly_restricted') return 'Possibly Restricted';
    return status;
  }
}
