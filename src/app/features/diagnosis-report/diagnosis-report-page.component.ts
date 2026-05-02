import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { filter, distinctUntilChanged } from 'rxjs/operators';
import { DeepDiagnosisService, DeepDiagnosisState, DiagnosisStepId } from '../../core/diagnostics/deep-diagnosis.service';
import { DiagnosisExportService } from '../../core/diagnostics/intelligence/diagnosis-export.service';
import { DiagnosisHistoryService } from '../../core/diagnostics/diagnosis-history.service';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';
import { VehicleProfile } from '../../core/models/vehicle-profile.model';
import { ObdAdapter, OBD_ADAPTER } from '../../core/adapters/obd-adapter.interface';
import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';
import { DtcCodeCardComponent } from '../../shared/dtc-code-card/dtc-code-card.component';
import { ReplacePipe } from '../../shared/pipes/replace.pipe';
import { ConfidenceLevel, RepairStep } from '../../core/diagnostics/intelligence/diagnosis-intelligence.models';

interface StepDef { id: DiagnosisStepId; label: string; }

const STEPS: StepDef[] = [
  { id: 'baseline_scan',     label: 'Baseline' },
  { id: 'warmup_monitoring', label: 'Warm-up'  },
  { id: 'idle_test',         label: 'Idle'     },
  { id: 'rev_test',          label: 'Rev'      },
  { id: 'completed',         label: 'Done'     },
];

const STEP_INDEX: Partial<Record<DiagnosisStepId, number>> = {
  baseline_scan:     0,
  warmup_monitoring: 1,
  idle_test:         2,
  rev_test:          3,
  driving_prompt:    4,
  driving_analysis:  4,
  completed:         4,
};

@Component({
  selector: 'app-diagnosis-report-page',
  standalone: true,
  imports: [CommonModule, DatePipe, DtcCodeCardComponent, ReplacePipe],
  templateUrl: './diagnosis-report-page.component.html',
  styleUrls: ['./diagnosis-report-page.component.scss'],
})
export class DiagnosisReportPageComponent implements OnInit, OnDestroy {
  private diagnosisService = inject(DeepDiagnosisService);
  private exportService    = inject(DiagnosisExportService);
  private historyService   = inject(DiagnosisHistoryService);
  private vehicleService   = inject(VehicleProfileService);
  private obdAdapter       = inject<ObdAdapter>(OBD_ADAPTER);
  private router           = inject(Router);

  readonly state$:            Observable<DeepDiagnosisState>                             = this.diagnosisService.state$;
  readonly profile$:          Observable<VehicleProfile | null>                          = this.vehicleService.activeProfile$;
  readonly connectionStatus$: Observable<'disconnected'|'connecting'|'connected'|'error'> = this.obdAdapter.connectionStatus$;
  readonly liveFrame$:        Observable<ObdLiveFrame>                                   = this.obdAdapter.data$;

  readonly steps = STEPS;

  copyDone = false;
  private sub = new Subscription();

  ngOnInit(): void {
    // Auto-save each completed diagnosis to history
    this.sub.add(
      this.diagnosisService.state$.pipe(
        distinctUntilChanged((a, b) => a.status === b.status),
        filter(s => s.status === 'completed'),
      ).subscribe(state => {
        const profile = this.vehicleService.getActiveProfile();
        const name = profile ? `${profile.year} ${profile.make} ${profile.model}`.trim() : 'Unknown Vehicle';
        this.historyService.save(state, name);
      })
    );
  }

  // ── Step stepper helpers ─────────────────────────────────────────────────

  stepIndex(step: DiagnosisStepId): number { return STEP_INDEX[step] ?? 0; }

  isStepDone(idx: number, step: DiagnosisStepId, status: string): boolean {
    if (status === 'completed') return true;
    return idx < this.stepIndex(step);
  }

  isStepActive(idx: number, step: DiagnosisStepId): boolean {
    return idx === this.stepIndex(step);
  }

  // ── Rev / warm-up / idle helpers ─────────────────────────────────────────

  revPhaseLabel(rpm: number): string { return rpm >= 2000 ? 'Hold steady…' : 'Raise RPM to ~2500'; }
  revPhaseClass(rpm: number): string { return rpm >= 2000 ? 'at-target' : 'below-target'; }
  rpmProgressPct(rpm: number): number { return Math.min(Math.round((rpm / 2500) * 100), 100); }

  coolantPct(temp: number): number { return Math.min(Math.round((temp / 75) * 100), 100); }
  coolantStatusLabel(temp: number): string {
    if (temp >= 75) return 'Ready';
    if (temp >= 50) return 'Warming…';
    return 'Cold';
  }
  coolantStatusClass(temp: number): string {
    if (temp >= 75) return 'ready';
    if (temp >= 50) return 'warming';
    return 'cold';
  }

  rpmStabilityClass(rpm: number): string { return rpm >= 600 && rpm <= 1100 ? 'stable' : 'unstable'; }
  rpmStabilityLabel(rpm: number): string { return rpm >= 600 && rpm <= 1100 ? 'Stable' : 'Out of range'; }

  normalizeError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes('not revved') || (m.includes('not enough') && m.includes('rpm'))) return 'Rev not detected';
    if (m.includes('unstable idle') || m.includes('rpm fluctuation'))               return 'RPM unstable';
    if (m.includes('timed out')    || m.includes('timeout'))                        return 'Test timed out';
    return message;
  }

  vehicleName(profile: VehicleProfile | null): string {
    if (!profile) return 'Unknown Vehicle';
    return `${profile.year} ${profile.make} ${profile.model}`.trim();
  }

  severityClass(level: string | undefined): string { return level ? level.toLowerCase() : ''; }
  confidenceClass(level: ConfidenceLevel | undefined): string { return level ? level.toLowerCase() : ''; }
  confidencePct(level: ConfidenceLevel | undefined): number {
    if (level === 'High')   return 100;
    if (level === 'Medium') return 60;
    if (level === 'Low')    return 25;
    return 0;
  }
  priorityClass(priority: RepairStep['priority']): string { return priority.toLowerCase(); }

  getDtcFindingConfidence(state: DeepDiagnosisState, findingMsg: string): ConfidenceLevel | undefined {
    return state.correlationFindings?.find(f => f.message === findingMsg)?.confidence;
  }

  primaryRootCause(state: DeepDiagnosisState) {
    const top = state.rootCauses?.[0];
    return top && (top.confidence === 'High' || top.confidence === 'Medium') ? top : null;
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async connectAdapter(): Promise<void> {
    try { await this.obdAdapter.connect(); } catch { /* reflected in connectionStatus$ */ }
  }

  startDiagnosis():         void { this.diagnosisService.startDiagnosis(); }
  cancelDiagnosis():        void { this.diagnosisService.cancelDiagnosis(); }
  moveNow():                void { this.diagnosisService.moveNow(); }
  stayOnStep():             void { this.diagnosisService.stayOnCurrentStep(); }
  completeWithoutDriving(): void { this.diagnosisService.completeWithoutDriving(); }
  exportJson(s: DeepDiagnosisState): void { this.exportService.exportJson(s); }
  exportCsv(s: DeepDiagnosisState):  void { this.exportService.exportCsv(s); }
  goToVehicleProfile():     void { this.router.navigate(['/vehicle-profile']); }
  goToHistory():            void { this.router.navigate(['/sessions']); }

  async copyShareText(state: DeepDiagnosisState, profile: VehicleProfile | null): Promise<void> {
    const text = this.exportService.buildShareText(state, this.vehicleName(profile));
    try {
      await navigator.clipboard.writeText(text);
      this.copyDone = true;
      setTimeout(() => { this.copyDone = false; }, 2000);
    } catch { /* clipboard not available */ }
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }
}
