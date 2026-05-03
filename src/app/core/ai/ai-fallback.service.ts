import { Injectable } from '@angular/core';
import { AiDiagnosisResponse } from './ai-diagnosis.models';
import { AiEvidence } from './ai-diagnosis.models';
import { tuneConfidence } from './ai-confidence-tuner';

/**
 * Produces a deterministic AiDiagnosisResponse when the AI service is
 * unavailable, the API key is missing, or the model response fails validation.
 *
 * v2 improvements:
 * - Explanation opener names what the car is doing, not the DTC system
 * - Evidence includes measured signal values when present
 * - next_steps ordered: most specific/immediate diagnostic action first
 * - Confidence passed through tuneConfidence() for signal-aware adjustments
 * - Clean diagnosis produces "No immediate action required" as step 1
 */
@Injectable({ providedIn: 'root' })
export class AiFallbackService {

  generate(evidence: AiEvidence): AiDiagnosisResponse {
    const confidence = tuneConfidence(evidence);
    const primary_issue = this.buildPrimaryIssue(evidence);
    const evidenceItems = this.buildEvidence(evidence);
    const explanation   = this.buildExplanation(evidence);
    const next_steps    = this.buildNextSteps(evidence);

    return { primary_issue, confidence, evidence: evidenceItems, explanation, next_steps };
  }

  private buildPrimaryIssue(evidence: AiEvidence): string {
    if (!evidence.primaryCause && !evidence.dtcs.length) return 'No fault detected';

    // Prefer DTC-prefixed title when a matching DTC is present
    if (evidence.primaryCause && evidence.dtcs.length) {
      return `${evidence.dtcs[0].code} — ${evidence.primaryCause.title}`;
    }
    if (evidence.primaryCause) return evidence.primaryCause.title;
    return `${evidence.dtcs[0].code} — ${evidence.dtcs[0].title}`;
  }

  private buildEvidence(evidence: AiEvidence): string[] {
    const items: string[] = [];

    // DTCs first (most authoritative)
    evidence.dtcs.slice(0, 3).forEach(d =>
      items.push(`${d.code}: ${d.title}${d.severity ? ` [${d.severity}]` : ''}`)
    );

    // Measured signal values (specific numbers ground the explanation)
    if (evidence.fuelTrimNote) items.push(`Fuel trim: ${evidence.fuelTrimNote}`);
    if (evidence.idleStabilityNote) items.push(`Idle: ${evidence.idleStabilityNote}`);

    // Correlation findings (verbatim from the diagnostic engine)
    evidence.correlationFindings.slice(0, 2).forEach(f => items.push(f));

    if (!items.length) {
      items.push('No fault codes or significant signal anomalies detected');
    }

    return items.slice(0, 5);
  }

  private buildExplanation(evidence: AiEvidence): string {
    // ── Clean diagnosis ────────────────────────────────────────────────────────
    if (!evidence.primaryCause && !evidence.dtcs.length) {
      return 'Your vehicle passed the diagnostic scan with no fault codes and no significant signal anomalies. All monitored systems appear to be operating within normal parameters. No immediate action is needed — continue with your normal service schedule.';
    }

    const parts: string[] = [];

    // Open with what the car is actually doing (owner-facing language)
    if (evidence.primaryCause) {
      const causeTitle = evidence.primaryCause.title.toLowerCase();
      if (causeTitle.includes('lean') || causeTitle.includes('vacuum')) {
        parts.push('Your engine is running lean — it\'s getting too much air relative to fuel.');
      } else if (causeTitle.includes('rich') || causeTitle.includes('injector')) {
        parts.push('Your engine is running rich — it\'s getting too much fuel relative to air.');
      } else if (causeTitle.includes('misfire')) {
        parts.push('Your engine is misfiring — one or more cylinders are not firing correctly.');
      } else if (causeTitle.includes('maf') || causeTitle.includes('mass air')) {
        parts.push('Your airflow sensor is giving incorrect readings.');
      } else if (causeTitle.includes('catalyst') || causeTitle.includes('catalytic')) {
        parts.push('Your catalytic converter is not cleaning exhaust gases as efficiently as it should.');
      } else {
        parts.push(`Your vehicle has a ${evidence.severityLevel.toLowerCase()}-severity fault.`);
      }
    } else if (evidence.dtcs.length) {
      parts.push(`Your vehicle has ${evidence.dtcs.length} stored fault code${evidence.dtcs.length > 1 ? 's' : ''}: ${evidence.dtcs.map(d => d.code).join(', ')}.`);
    }

    // Add the technical cause explanation (from the deterministic diagnosis engine)
    if (evidence.primaryCause?.explanation) {
      parts.push(evidence.primaryCause.explanation);
    }

    // Severity urgency note for high/critical
    if (evidence.severityLevel === 'Critical') {
      parts.push('Do not drive until this is resolved — immediate inspection is required.');
    } else if (evidence.severityLevel === 'High') {
      parts.push('Address this soon to prevent further damage.');
    }

    if (evidence.isPartial) {
      parts.push('Note: Some test steps did not complete, so this assessment may be incomplete.');
    }

    return parts.join(' ').slice(0, 600);
  }

  private buildNextSteps(evidence: AiEvidence): string[] {
    // Clean diagnosis: clear, reassuring, no-action first step
    if (!evidence.primaryCause && !evidence.dtcs.length) {
      return ['No immediate action required — vehicle appears healthy', 'Schedule routine service at normal interval'];
    }

    const steps = [...evidence.recommendedChecks];

    if (!steps.length && evidence.dtcs.length) {
      steps.push(`Retrieve full freeze-frame data for ${evidence.dtcs[0].code} with a scan tool`);
      steps.push('Review manufacturer service information for each stored DTC');
    }

    // Ensure the most diagnostic-specific step is first (not a generic one)
    const prioritised = this.prioritiseSteps(steps, evidence);
    return prioritised.slice(0, 4);
  }

  private prioritiseSteps(steps: string[], evidence: AiEvidence): string[] {
    // Move steps containing specific test actions to the front
    const immediateKeywords = ['smoke test', 'perform', 'test', 'measure', 'check fuel pressure', 'inspect coil', 'swap coil', 'compression test', 'scan', 'freeze-frame'];
    const immediate = steps.filter(s => immediateKeywords.some(k => s.toLowerCase().includes(k)));
    const rest = steps.filter(s => !immediateKeywords.some(k => s.toLowerCase().includes(k)));
    return [...immediate, ...rest];
  }
}
