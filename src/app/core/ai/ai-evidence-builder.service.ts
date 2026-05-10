import { Injectable } from '@angular/core';
import { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import { AiEvidence } from './ai-diagnosis.models';

/**
 * Converts a completed DeepDiagnosisState into the compact AiEvidence packet
 * sent to the Firebase /aiDiagnose function.
 */
@Injectable({ providedIn: 'root' })
export class AiEvidenceBuilderService {

  build(state: DeepDiagnosisState): AiEvidence {
    const dtcs = (state.dtcCodes ?? []).map(d => ({
      code: d.code,
      title: d.title,
      severity: d.severity,
    }));

    const correlationFindings = (state.correlationFindings ?? []).map(f => f.message);

    const severity     = state.severity;
    const severityScore = severity?.score ?? 0;
    const severityLevel = severity?.level ?? 'Low';

    const recs = state.recommendations;
    const recommendedChecks = recs?.recommendedChecks ?? [];

    // Derive primaryCause and additionalCauses from correlation findings
    // (the worktree's DeepDiagnosisState doesn't expose rootCauses yet)
    const primaryCause = this.inferPrimaryCause(state);
    const additionalCauses: { title: string; confidence: string }[] = [];

    // Fuel trim note from correlation findings
    const fuelTrimNote = this.extractFuelTrimNote(correlationFindings);
    const idleStabilityNote = this.extractIdleStabilityNote(correlationFindings);

    return {
      severityScore,
      severityLevel,
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

  private inferPrimaryCause(
    state: DeepDiagnosisState
  ): AiEvidence['primaryCause'] {
    const findings = state.correlationFindings ?? [];
    if (!findings.length && !(state.dtcCodes ?? []).length) return null;

    // Use the first high-severity correlation finding as a best-effort cause
    const upgraded = findings.find(f => f.upgradesSeverity);
    if (upgraded) {
      return {
        title:       upgraded.message.split('.')[0].slice(0, 80),
        confidence:  state.severity?.level === 'Critical' ? 'High'
                   : state.severity?.level === 'High'     ? 'Medium' : 'Low',
        explanation: upgraded.message,
      };
    }
    return null;
  }

  private extractFuelTrimNote(findings: string[]): string | null {
    const match = findings.find(f =>
      f.toLowerCase().includes('stft') || f.toLowerCase().includes('ltft') ||
      f.toLowerCase().includes('fuel trim')
    );
    return match ?? null;
  }

  private extractIdleStabilityNote(findings: string[]): string | null {
    const match = findings.find(f =>
      f.toLowerCase().includes('rpm') || f.toLowerCase().includes('idle')
    );
    return match ?? null;
  }
}
