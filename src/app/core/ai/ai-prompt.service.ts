import { Injectable } from '@angular/core';
import { AiEvidence } from './ai-diagnosis.models';

// ── Calibrated system prompt (v2) ────────────────────────────────────────────
// Changes vs v1:
//   - Mechanic-first tone instruction: next_steps must be workshop-ready actions
//   - Explicit negative examples to prevent generic outputs
//   - Explanation framing: "as if explaining to the car owner, not a textbook"
//   - Confidence derivation clarified: must come from primaryCause confidence
//   - evidence rule tightened: must name the DTC, signal value, or finding verbatim

const SYSTEM_PROMPT = `You are a vehicle diagnostic assistant inside a professional OBD2 tool used by mechanics and workshops.

RULES — follow every rule without exception:
1. Only use the evidence in the user message. Do not introduce symptoms, components, or causes not explicitly listed there.
2. Do not mention part numbers, prices, labour times, or specific brands.
3. Respond ONLY with a single valid JSON object — no markdown fences, no text before or after the JSON.
4. "explanation" must be 20–120 words, written as if explaining to the car owner (not a textbook). Do not start with "The vehicle" — start with the condition. Example start: "Your engine is running lean because..."
5. "evidence" items must directly name a DTC code, a measured value, or a finding from the provided data. NEVER write generic phrases like "vehicle has a fault" or "further testing required".
6. "confidence" must be exactly the confidence level of the provided primaryCause: "High", "Medium", or "Low". If no primaryCause is given, use "Low".
7. "next_steps" must be concrete, workshop-ready actions (e.g. "Perform intake smoke test with engine running"). NEVER write vague steps like "check the vehicle" or "consult a mechanic".
8. Limit "next_steps" to 4 items, ordered highest-priority first.
9. If no fault codes or findings are present, set primary_issue to "No fault detected", confidence to "Low", and explain that the vehicle appears normal based on available data.

SCHEMA — respond with exactly this shape:
{
  "primary_issue": "<concise title, ≤80 chars>",
  "confidence": "High" | "Medium" | "Low",
  "evidence": ["<DTC or signal fact>", ...],
  "explanation": "<20–120 words, plain English for car owner>",
  "next_steps": ["<concrete workshop action>", ...]
}

NEGATIVE EXAMPLES — do not produce outputs like these:
  BAD evidence: "The vehicle shows signs of a fault"     → TOO GENERIC
  BAD next_step: "Check the car at a garage"             → TOO VAGUE
  BAD explanation: "The engine management system has detected an anomaly..." → TEXTBOOK LANGUAGE
  BAD primary_issue: "Engine fault detected"             → NOT SPECIFIC ENOUGH`;

@Injectable({ providedIn: 'root' })
export class AiPromptService {

  readonly systemPrompt = SYSTEM_PROMPT;

  buildUserMessage(evidence: AiEvidence): string {
    const lines: string[] = ['DIAGNOSIS EVIDENCE:'];

    lines.push(`Severity: ${evidence.severityLevel} (score ${evidence.severityScore}/100)`);

    if (evidence.isPartial) {
      lines.push('Note: This is a partial diagnosis — not all test steps completed.');
    }

    if (evidence.dtcs.length) {
      lines.push(`\nFault Codes (${evidence.dtcs.length}):`);
      evidence.dtcs.forEach(d => lines.push(`  - ${d.code}: ${d.title}${d.severity ? ` [${d.severity}]` : ''}`));
    } else {
      lines.push('\nFault Codes: None detected');
    }

    if (evidence.primaryCause) {
      lines.push(`\nPrimary Root Cause (${evidence.primaryCause.confidence} confidence):`);
      lines.push(`  ${evidence.primaryCause.title}`);
      lines.push(`  ${evidence.primaryCause.explanation}`);
    } else {
      lines.push('\nPrimary Root Cause: Not identified');
    }

    if (evidence.additionalCauses.length) {
      lines.push('\nOther Candidates:');
      evidence.additionalCauses.forEach(c => lines.push(`  - ${c.title} [${c.confidence}]`));
    }

    if (evidence.correlationFindings.length) {
      lines.push('\nCorrelation Findings:');
      evidence.correlationFindings.forEach(f => lines.push(`  - ${f}`));
    }

    if (evidence.fuelTrimNote) {
      lines.push(`\nFuel Trim Signal: ${evidence.fuelTrimNote}`);
    }

    if (evidence.idleStabilityNote) {
      lines.push(`Idle Signal: ${evidence.idleStabilityNote}`);
    }

    if (evidence.recommendedChecks.length) {
      lines.push('\nExisting Recommended Checks (use these as basis for next_steps):');
      evidence.recommendedChecks.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
    }

    lines.push('\nRespond with JSON only. Use only the evidence above.');
    return lines.join('\n');
  }
}
