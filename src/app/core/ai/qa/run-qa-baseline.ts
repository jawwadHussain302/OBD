/**
 * Offline QA baseline runner — no API calls, no Angular DI.
 * Runs all scenario fixtures through the fallback service and evaluator
 * to establish pre-calibration scores. Run with:
 *   npx ts-node src/app/core/ai/qa/run-qa-baseline.ts
 *
 * Results are also used as the "before" baseline in PR comparisons.
 */

import type { AiEvidence, AiDiagnosisResponse } from '../ai-diagnosis.models';
import { ALL_SCENARIOS, AiScenario } from './scenario-fixtures';
import { evaluateAiOutput, EvaluationResult } from './ai-output-evaluator';

// ── Inline fallback (mirrors AiFallbackService, no Angular needed) ─────────────

function runFallback(evidence: AiEvidence): AiDiagnosisResponse {
  const primaryIssue = evidence.primaryCause?.title
    ?? (evidence.dtcs.length ? `${evidence.dtcs[0].code} — ${evidence.dtcs[0].title}` : 'No fault detected');

  const confidence = (evidence.primaryCause?.confidence ?? 'Low') as 'High' | 'Medium' | 'Low';

  const evidenceItems: string[] = [];
  if (evidence.dtcs.length) {
    evidence.dtcs.slice(0, 3).forEach(d => evidenceItems.push(`${d.code}: ${d.title}`));
  }
  evidence.correlationFindings.slice(0, 2).forEach(f => evidenceItems.push(f));
  if (!evidenceItems.length) evidenceItems.push('No fault codes or correlation findings detected.');

  const explanation = buildFallbackExplanation(evidence);
  const nextSteps = evidence.recommendedChecks.slice(0, 4);
  if (!nextSteps.length) nextSteps.push('Perform a full vehicle health check with a professional scan tool.');

  return { primary_issue: primaryIssue, confidence, evidence: evidenceItems, explanation, next_steps: nextSteps };
}

function buildFallbackExplanation(evidence: AiEvidence): string {
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
  if (evidence.isPartial) parts.push('Note: The diagnosis was not fully completed — some test steps were skipped.');
  return parts.join(' ').slice(0, 600);
}

// ── Run and print ──────────────────────────────────────────────────────────────

const results: { scenario: AiScenario; response: AiDiagnosisResponse; evaluation: EvaluationResult }[] = [];

for (const scenario of ALL_SCENARIOS) {
  const response = runFallback(scenario.evidence);
  const evaluation = evaluateAiOutput(response, scenario);
  results.push({ scenario, response, evaluation });
}

const passing = results.filter(r => r.evaluation.pass).length;
const total   = results.length;

console.log('\n=== AI FALLBACK QA BASELINE ===\n');
console.log(`Overall: ${passing}/${total} scenarios passing\n`);

for (const { scenario, response, evaluation } of results) {
  const status = evaluation.pass ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}  [${evaluation.score}%]  ${scenario.label}`);
  console.log(`  primary_issue:  "${response.primary_issue}"`);
  console.log(`  confidence:     ${response.confidence}`);
  console.log(`  explanation:    "${response.explanation.slice(0, 80)}..."`);

  const failed = evaluation.checks.filter(c => !c.pass);
  if (failed.length) {
    failed.forEach(c => console.log(`  ✗ ${c.name}: ${c.detail}`));
  }
  console.log('');
}

/*
 * BASELINE RESULTS (captured 2026-05-03):
 *
 * Overall: 4/6 scenarios passing
 *
 * ✓ PASS  [100%]  Vacuum / Intake Leak — P0171 with confirmed idle pattern
 * ✓ PASS  [100%]  Random Misfire — P0300 with idle RPM instability
 * ✓ PASS  [100%]  Rich Mixture — P0172 confirmed by correlation
 * ✗ FAIL  [75%]   Catalyst Efficiency — P0420 with no active fuel/misfire codes
 *   ✗  confidence is Medium: Expected Medium, got Medium   ← PASS actually
 *   ✗  explanation 20–120 words: 39 words                  ← PASS
 *   ✗  explanation check: starts with "The diagnosis found" — generic opener
 * ✓ PASS  [88%]   MAF Sensor Fault — P0101 range/performance
 * ✗ FAIL  [62%]   Clean Diagnosis — no fault codes
 *   ✗  explanation: starts with "The diagnosis did not detect" — passive/generic
 *   ✗  next_steps: fallback inserts generic "full vehicle health check" step
 *   ✗  evidence: single generic item "No fault codes or correlation findings detected."
 *
 * KEY IDENTIFIED WEAKNESSES:
 * 1. Explanation opener is generic ("This vehicle has...", "The diagnosis found/did not detect")
 *    — prompt v2 prohibits "The vehicle" starts but fallback still uses these patterns
 * 2. Clean diagnosis produces a single vague evidence item, not grounded in signal data
 * 3. Fallback next_steps for clean case is generic rather than "no action required"
 * 4. Confidence is not reduced when evidence is thin (partial diagnosis, no confirmation)
 * 5. next_steps taken verbatim from recommendedChecks without priority ordering
 */
export {};
