import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf, NgFor, NgClass, TitleCasePipe, DecimalPipe } from '@angular/common';
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
import { DiagnosticEngineService } from '../../core/diagnostics/diagnostic-engine.service';
import { allDiagnosticPacks } from '../../core/diagnostics/packs';
import type { KnowledgePack, DiagnosticState, Step, StepOption } from '../../core/diagnostics/diagnostic-types';

export interface HypothesisView {
  id: string;
  label: string;
  score: number;
  barPct: number;
}

@Component({
  selector: 'app-diagnosis-assistant-page',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, NgClass, TitleCasePipe, DecimalPipe, O2SensorGraphComponent],
  templateUrl: './diagnosis-assistant-page.component.html',
  styleUrls: ['./diagnosis-assistant-page.component.scss'],
})
export class DiagnosisAssistantPageComponent {
  private router              = inject(Router);
  private deepDiagnosis       = inject(DeepDiagnosisService);
  private cylinderAnalysis    = inject(CylinderAnalysisService);
  private catalyticAnalysis   = inject(CatalyticConverterAnalysisService);
  private o2Buffer            = inject(O2SensorBufferService);
  private diagnosticEngine    = inject(DiagnosticEngineService);

  // ── All knowledge packs ──────────────────────────────────────────────────────
  readonly allPacks: readonly KnowledgePack[] = allDiagnosticPacks;
  readonly diagnosticState$: Observable<DiagnosticState | null> =
    this.diagnosticEngine.diagnosticState$;

  // ── Panel visibility ─────────────────────────────────────────────────────────
  showGuidedPacksPanel = false;
  showCylinderPanel    = false;
  showCatalyticPanel   = false;

  /** The pack that is currently selected (pre-start or mid-run). */
  activePack: KnowledgePack | null = null;

  // ── Observables ──────────────────────────────────────────────────────────────

  readonly cylinderResult$: Observable<CylinderAnalysisResult> =
    this.deepDiagnosis.state$.pipe(
      map(state => this.cylinderAnalysis.analyse(state.dtcCodes ?? []))
    );

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

  // ── Navigation ───────────────────────────────────────────────────────────────

  openFullDiagnosis(): void {
    this.router.navigate(['/diagnosis-report']);
  }

  // ── Panel toggles ────────────────────────────────────────────────────────────

  toggleGuidedPacks(): void {
    this.showGuidedPacksPanel = !this.showGuidedPacksPanel;
    if (!this.showGuidedPacksPanel) {
      this.activePack = null;
    }
  }

  toggleCylinderAnalysis(): void {
    this.showCylinderPanel = !this.showCylinderPanel;
  }

  toggleCatalyticAnalysis(): void {
    this.showCatalyticPanel = !this.showCatalyticPanel;
  }

  // ── Pack engine ──────────────────────────────────────────────────────────────

  launchPack(pack: KnowledgePack): void {
    this.activePack = pack;
    this.diagnosticEngine.startPack(pack);
  }

  applyAnswer(option: StepOption): void {
    this.diagnosticEngine.applyAnswer(option);
  }

  resetPack(): void {
    this.activePack = null;
  }

  currentStep(state: DiagnosticState): Step | null {
    return this.diagnosticEngine.getCurrentStep();
  }

  private static readonly ACRONYMS: Record<string, string> = {
    Dpf: 'DPF', Egr: 'EGR', Hv: 'HV', Soc: 'SOC', Soh: 'SOH', Or: 'or',
  };

  private hypothesisLabel(id: string): string {
    return id
      .replace(/_issue$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w+/g, word => {
        const cap = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        return DiagnosisAssistantPageComponent.ACRONYMS[cap] ?? cap;
      });
  }

  topHypotheses(state: DiagnosticState): HypothesisView[] {
    const entries = Object.entries(state.hypothesisScores)
      .map(([id, score]) => ({
        id,
        score,
        label: this.hypothesisLabel(id),
      }))
      .sort((a, b) => b.score - a.score);

    const maxScore = Math.max(...entries.map(e => e.score), 0.01);
    return entries.map(e => ({
      ...e,
      barPct: Math.max(0, (e.score / maxScore) * 100),
    }));
  }

  // ── Catalytic helpers ────────────────────────────────────────────────────────

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
