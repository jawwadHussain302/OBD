import { Injectable } from '@angular/core';
import { AiEvidence } from './ai-diagnosis.models';

const SYSTEM_PROMPT = `You are a vehicle diagnostic assistant embedded in a professional OBD2 tool.

RULES — you MUST follow all of these without exception:
1. Only use the evidence provided in the user message. Do not add facts, symptoms, or components not explicitly listed.
2. Do not mention specific part numbers, prices, or brands.
3. Do not speculate about root causes that are not supported by the provided DTCs or findings.
4. Respond ONLY with a valid JSON object matching the exact schema below — no markdown, no prose outside the JSON.
5. Keep "explanation" under 120 words and written in plain English a car owner can understand.
6. "evidence" items must be direct quotes or paraphrases of the provided data.
7. "confidence" must be exactly "High", "Medium", or "Low" — derived from the primary cause confidence.
8. Limit "next_steps" to 4 items maximum, ordered by priority.

JSON SCHEMA (respond with this exact shape):
{
  "primary_issue": "<concise issue title>",
  "confidence": "High" | "Medium" | "Low",
  "evidence": ["<evidence item 1>", ...],
  "explanation": "<plain English explanation under 120 words>",
  "next_steps": ["<step 1>", "<step 2>", ...]
}`;

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
      lines.push(`\nFuel Trim: ${evidence.fuelTrimNote}`);
    }

    if (evidence.idleStabilityNote) {
      lines.push(`Idle: ${evidence.idleStabilityNote}`);
    }

    if (evidence.recommendedChecks.length) {
      lines.push('\nExisting Recommended Checks:');
      evidence.recommendedChecks.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
    }

    lines.push('\nUsing only the above evidence, provide your diagnostic assessment as JSON.');
    return lines.join('\n');
  }
}
