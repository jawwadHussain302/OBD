import { Injectable } from '@angular/core';
import { AiEvidence } from './ai-diagnosis.models';

// ── Calibrated system prompt (v3) ────────────────────────────────────────────
// Changes vs v2:
//   + primary_issue format rule: cite the DTC code when one is present
//   + evidence rule: include measured signal values (STFT %, RPM σ) when given
//   + explanation opener: must name what the car is doing, not the DTC system
//   + next_steps: priority ordering is explicit (Immediate → Soon → Routine)
//   + clean-diagnosis handling: assert "No actionable steps required" as step 1
//   + confidence clarification: partial diagnosis → reduce one level
//   + added good-output example to anchor the expected format

const SYSTEM_PROMPT = `You are a vehicle diagnostic assistant inside a professional OBD2 tool used by mechanics and workshops.

RULES — follow every rule without exception:
1. Only use evidence in the user message. Do not introduce symptoms, components, or causes not listed there.
2. Do not mention part numbers, prices, labour times, or specific brands.
3. Respond ONLY with a single valid JSON object — no markdown, no text outside the JSON.
4. "primary_issue": when a fault code is present, start with the code: e.g. "P0171 — Lean Condition (Vacuum Leak)". When no code, use the cause title directly. Max 80 chars.
5. "explanation" (20–120 words): open with what the car is actually doing, not the DTC system. Start with "Your engine...", "The fuel mixture...", or similar owner-facing language. Name the fault code if one is present.
6. "evidence": each item must cite a DTC code, a measured signal value, or a verbatim correlation finding. NEVER write generic phrases like "vehicle has a fault" or "fault detected".
7. "confidence": use the primaryCause confidence exactly. If the diagnosis is partial, drop one level (High → Medium, Medium → Low). If no primaryCause, use "Low".
8. "next_steps": workshop-ready actions, ordered Immediate first, then Soon, then Routine. Max 4 items. Never write "check the vehicle" or "consult a garage".
9. Clean diagnosis (no fault codes, no findings): set primary_issue to "No fault detected", confidence "Low", first next_step "No immediate action required — monitor and schedule routine service".

SCHEMA:
{
  "primary_issue": "<DTC + short title if applicable, ≤80 chars>",
  "confidence": "High" | "Medium" | "Low",
  "evidence": ["<DTC code / signal value / finding>", ...],
  "explanation": "<20–120 words, owner-facing language>",
  "next_steps": ["<Immediate action>", "<Soon action>", ...]
}

GOOD EXAMPLE (vacuum leak scenario):
{
  "primary_issue": "P0171 — Lean Condition (Vacuum / Intake Leak)",
  "confidence": "High",
  "evidence": ["P0171: System Too Lean (Bank 1)", "STFT B1 +18% at idle, drops to +4% at 2500 RPM", "Vacuum leak pattern: trims improve at higher RPM"],
  "explanation": "Your engine is pulling in extra unmetered air through a gap in the intake system. The short-term fuel trim is very high at idle but normalises under load, which is the classic signature of a vacuum or intake leak rather than a fuel delivery problem.",
  "next_steps": ["Perform intake smoke test with engine running to locate air leak", "Inspect PCV valve and breather hose for cracks", "Check all intake hoses between air filter and throttle body", "Clear DTC and verify STFT returns to ±5% after repair"]
}

NEGATIVE EXAMPLES — never produce:
  BAD evidence:    "The vehicle shows signs of a fault"     → GENERIC
  BAD next_step:   "Check the car at a garage"             → VAGUE
  BAD explanation: "The engine management system has detected P0171..." → TEXTBOOK
  BAD primary_issue: "Engine fault detected"               → NOT SPECIFIC`;

@Injectable({ providedIn: 'root' })
export class AiPromptService {

  readonly systemPrompt = SYSTEM_PROMPT;

  buildUserMessage(evidence: AiEvidence): string {
    const lines: string[] = ['DIAGNOSIS EVIDENCE:'];

    lines.push(`Severity: ${evidence.severityLevel} (score ${evidence.severityScore}/100)`);

    if (evidence.isPartial) {
      lines.push('⚠ Partial diagnosis — not all test steps completed. Reduce confidence by one level.');
    }

    if (evidence.dtcs.length) {
      lines.push(`\nFault Codes (${evidence.dtcs.length}):`);
      evidence.dtcs.forEach(d => lines.push(`  - ${d.code}: ${d.title}${d.severity ? ` [${d.severity}]` : ''}`));
    } else {
      lines.push('\nFault Codes: None detected');
    }

    if (evidence.primaryCause) {
      lines.push(`\nPrimary Root Cause (${evidence.primaryCause.confidence} confidence):`);
      lines.push(`  Title: ${evidence.primaryCause.title}`);
      lines.push(`  Detail: ${evidence.primaryCause.explanation}`);
    } else {
      lines.push('\nPrimary Root Cause: Not identified — use "Low" confidence');
    }

    if (evidence.additionalCauses.length) {
      lines.push('\nOther Candidates (lower priority):');
      evidence.additionalCauses.forEach(c => lines.push(`  - ${c.title} [${c.confidence}]`));
    }

    if (evidence.correlationFindings.length) {
      lines.push('\nCorrelation Findings (cite these verbatim in evidence):');
      evidence.correlationFindings.forEach(f => lines.push(`  - ${f}`));
    }

    if (evidence.fuelTrimNote) {
      lines.push(`\nFuel Trim Signal (cite the % values in evidence): ${evidence.fuelTrimNote}`);
    }

    if (evidence.idleStabilityNote) {
      lines.push(`Idle Stability Signal (cite RPM variance in evidence): ${evidence.idleStabilityNote}`);
    }

    if (evidence.recommendedChecks.length) {
      lines.push('\nRecommended Checks — use as basis for next_steps, Immediate priority first:');
      evidence.recommendedChecks.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
    } else if (!evidence.dtcs.length && !evidence.correlationFindings.length) {
      lines.push('\nRecommended Checks: None — vehicle appears clean.');
    }

    lines.push('\nRespond with JSON only. Cite specific DTC codes and signal values in evidence.');
    return lines.join('\n');
  }
}
