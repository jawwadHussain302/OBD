import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { DeepDiagnosisService, DeepDiagnosisState } from '../../core/diagnostics/deep-diagnosis.service';
import { DiagnosisExportService } from '../../core/diagnostics/intelligence/diagnosis-export.service';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';
import { VehicleProfile } from '../../core/models/vehicle-profile.model';
import { ObdAdapter, OBD_ADAPTER } from '../../core/adapters/obd-adapter.interface';
import { DtcCodeCardComponent } from '../../shared/dtc-code-card/dtc-code-card.component';
import { ReplacePipe } from '../../shared/pipes/replace.pipe';

@Component({
  selector: 'app-diagnosis-report-page',
  standalone: true,
  imports: [CommonModule, DatePipe, DtcCodeCardComponent, ReplacePipe],
  templateUrl: './diagnosis-report-page.component.html',
  styleUrls: ['./diagnosis-report-page.component.scss'],
})
export class DiagnosisReportPageComponent implements OnDestroy {
  private diagnosisService = inject(DeepDiagnosisService);
  private exportService = inject(DiagnosisExportService);
  private vehicleService = inject(VehicleProfileService);
  private obdAdapter = inject<ObdAdapter>(OBD_ADAPTER);
  private router = inject(Router);

  readonly state$: Observable<DeepDiagnosisState> = this.diagnosisService.state$;
  readonly profile$: Observable<VehicleProfile | null> = this.vehicleService.activeProfile$;
  readonly connectionStatus$: Observable<'disconnected' | 'connecting' | 'connected' | 'error'> =
    this.obdAdapter.connectionStatus$;

  vehicleName(profile: VehicleProfile | null): string {
    if (!profile) return 'Unknown Vehicle';
    return `${profile.year} ${profile.make} ${profile.model}`.trim();
  }

  severityClass(level: string | undefined): string {
    if (!level) return '';
    return level.toLowerCase();
  }

  async connectAdapter(): Promise<void> {
    try {
      await this.obdAdapter.connect();
    } catch {
      // connectionStatus$ reflects the error state
    }
  }

  startDiagnosis(): void {
    this.diagnosisService.startDiagnosis();
  }

  cancelDiagnosis(): void {
    this.diagnosisService.cancelDiagnosis();
  }

  moveNow(): void {
    this.diagnosisService.moveNow();
  }

  stayOnStep(): void {
    this.diagnosisService.stayOnCurrentStep();
  }

  completeWithoutDriving(): void {
    this.diagnosisService.completeWithoutDriving();
  }

  exportJson(state: DeepDiagnosisState): void {
    this.exportService.exportJson(state);
  }

  exportCsv(state: DeepDiagnosisState): void {
    this.exportService.exportCsv(state);
  }

  goToVehicleProfile(): void {
    this.router.navigate(['/vehicle-profile']);
  }

  ngOnDestroy(): void {}
}
