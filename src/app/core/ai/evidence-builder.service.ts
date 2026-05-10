import { Injectable } from '@angular/core';
import { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import { AiEvidence } from './ai-diagnosis.models';

@Injectable({ providedIn: 'root' })
export class EvidenceBuilderService {

  /**
   * Builds a compact, token-efficient evidence packet from a completed
   * diagnosis state. Only structured data is included — no raw frames,
   * no internal service state, nothing that could induce hallucination.
   */
  build(state: DeepDiagnosisState): AiEvidence {
    const dtcs = (state.dtcCodes ?? []).map(d => ({
      code: d.code,
      title: d.title,
      severity: d.severity ?? undefined,
    }));

    const rootCauses = state.rootCauses ?? [];
    const primaryCause = rootCauses[0]
      ? {
          title: rootCauses[0].title,
          confidence: rootCauses[0].confidence,
          explanation: rootCauses[0].explanation,
        }
      : null;

    const additionalCauses = rootCauses.slice(1, 4).map(c => ({
      title: c.title,
      confidence: c.confidence,
    }));

    const correlationFindings = (state.correlationFindings ?? [])
      .map(f => f.message)
      .slice(0, 5);

    const recommendedChecks = (state.recommendations?.recommendedChecks ?? []).slice(0, 6);

    // Summarise fuel-trim signal trend from DTC findings if available
    const fuelTrimNote = this.extractFuelTrimNote(state);
    const idleStabilityNote = this.extractIdleNote(state);

    return {
      severityScore: state.severity?.score ?? 0,
      severityLevel: state.severity?.level ?? 'Low',
      dtcs,
      primaryCause,
      additionalCauses,
      correlationFindings,
      recommendedChecks,
      fuelTrimNote,
      idleStabilityNote,
      isPartial: state.isPartial ?? false,
    };
  }

  private extractFuelTrimNote(state: DeepDiagnosisState): string | null {
    const findings = [...(state.findings ?? []), ...(state.dtcFindings ?? [])];
    const trimFinding = findings.find(f =>
      f.toLowerCase().includes('fuel trim') ||
      f.toLowerCase().includes('stft') ||
      f.toLowerCase().includes('ltft')
    );
    return trimFinding ?? null;
  }

  private extractIdleNote(state: DeepDiagnosisState): string | null {
    const findings = [...(state.findings ?? []), ...(state.dtcFindings ?? [])];
    const idleFinding = findings.find(f =>
      f.toLowerCase().includes('idle') || f.toLowerCase().includes('rpm instab')
    );
    return idleFinding ?? null;
  }
}
