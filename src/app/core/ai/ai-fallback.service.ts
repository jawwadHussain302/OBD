import { Injectable } from '@angular/core';
import { AiDiagnosisResponse } from './ai-diagnosis.models';
import { AiEvidence } from './ai-diagnosis.models';

/**
 * Produces a deterministic AiDiagnosisResponse from the evidence packet
 * when the AI service is unavailable, the API key is missing, or the
 * model response fails validation. The fallback never hallucinates because
 * it only reuses data already present in the evidence.
 */
@Injectable({ providedIn: 'root' })
export class AiFallbackService {

  generate(evidence: AiEvidence): AiDiagnosisResponse {
    const primaryIssue = evidence.primaryCause?.title
      ?? (evidence.dtcs.length ? `${evidence.dtcs[0].code} — ${evidence.dtcs[0].title}` : 'No fault detected');

    const confidence = (evidence.primaryCause?.confidence ?? 'Low') as 'High' | 'Medium' | 'Low';

    const evidenceItems: string[] = [];
    if (evidence.dtcs.length) {
      evidence.dtcs.slice(0, 3).forEach(d => evidenceItems.push(`${d.code}: ${d.title}`));
    }
    evidence.correlationFindings.slice(0, 2).forEach(f => evidenceItems.push(f));
    if (!evidenceItems.length) evidenceItems.push('No fault codes or correlation findings detected.');

    const explanation = this.buildExplanation(evidence);

    const nextSteps = evidence.recommendedChecks.slice(0, 4);
    if (!nextSteps.length) nextSteps.push('Perform a full vehicle health check with a professional scan tool.');

    return { primary_issue: primaryIssue, confidence, evidence: evidenceItems, explanation, next_steps: nextSteps };
  }

  private buildExplanation(evidence: AiEvidence): string {
    if (!evidence.primaryCause && !evidence.dtcs.length) {
      return 'The diagnosis did not detect any fault codes or significant signal anomalies. The vehicle appears to be operating within normal parameters based on the data collected.';
    }

    const parts: string[] = [];

    if (evidence.severityLevel === 'Critical' || evidence.severityLevel === 'High') {
      parts.push(`This vehicle has a ${evidence.severityLevel.toLowerCase()}-severity issue requiring prompt attention.`);
    } else {
      parts.push(`The diagnosis found ${evidence.severityLevel.toLowerCase()}-severity concerns.`);
    }

    if (evidence.primaryCause) {
      parts.push(`The most likely cause is ${evidence.primaryCause.title.toLowerCase()}.`);
      parts.push(evidence.primaryCause.explanation);
    } else if (evidence.dtcs.length) {
      parts.push(`${evidence.dtcs.length} fault code${evidence.dtcs.length > 1 ? 's were' : ' was'} detected: ${evidence.dtcs.map(d => d.code).join(', ')}.`);
    }

    if (evidence.isPartial) {
      parts.push('Note: The diagnosis was not fully completed — some test steps were skipped.');
    }

    return parts.join(' ').slice(0, 600);
  }
}
