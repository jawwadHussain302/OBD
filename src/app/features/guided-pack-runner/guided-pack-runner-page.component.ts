import { Component, OnInit, inject } from '@angular/core';
import { AsyncPipe, NgIf, NgFor, DecimalPipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
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
  selector: 'app-guided-pack-runner-page',
  standalone: true,
  imports: [AsyncPipe, NgIf, NgFor, DecimalPipe],
  templateUrl: './guided-pack-runner-page.component.html',
  styleUrls: ['./guided-pack-runner-page.component.scss'],
})
export class GuidedPackRunnerPageComponent implements OnInit {
  private router           = inject(Router);
  private route            = inject(ActivatedRoute);
  private diagnosticEngine = inject(DiagnosticEngineService);

  pack: KnowledgePack | null = null;
  notFound = false;

  readonly diagnosticState$: Observable<DiagnosticState | null> =
    this.diagnosticEngine.diagnosticState$;

  ngOnInit(): void {
    const slug   = this.route.snapshot.paramMap.get('packId') ?? '';
    const packId = slug.replace(/-/g, '_');
    const found  = allDiagnosticPacks.find(p => p.id === packId) ?? null;

    if (!found) {
      this.notFound = true;
      return;
    }

    this.pack = found;
    this.diagnosticEngine.startPack(found);
  }

  applyAnswer(option: StepOption): void {
    this.diagnosticEngine.applyAnswer(option);
  }

  currentStep(state: DiagnosticState): Step | null {
    return this.diagnosticEngine.getCurrentStep();
  }

  topHypotheses(state: DiagnosticState): HypothesisView[] {
    const entries = Object.entries(state.hypothesisScores)
      .map(([id, score]) => ({ id, score, label: this.hypothesisLabel(id) }))
      .sort((a, b) => b.score - a.score);

    const maxScore = Math.max(...entries.map(e => e.score), 0.01);
    return entries.map(e => ({
      ...e,
      barPct: Math.max(0, (e.score / maxScore) * 100),
    }));
  }

  restart(): void {
    if (this.pack) this.diagnosticEngine.startPack(this.pack);
  }

  goBack(): void {
    this.router.navigate(['/ai-diagnosis-assistant/guided']);
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
        return GuidedPackRunnerPageComponent.ACRONYMS[cap] ?? cap;
      });
  }
}
