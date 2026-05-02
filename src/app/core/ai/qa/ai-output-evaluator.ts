import { AiDiagnosisResponse } from '../ai-diagnosis.models';
import { AiScenario } from './scenario-fixtures';

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface EvaluationResult {
  scenarioId: string;
  scenarioLabel: string;
  pass: boolean;
  score: number;        // 0–100 based on checks passed
  checks: CheckResult[];
}

/**
 * Evaluates an AI response against the acceptance criteria for a given scenario.
 * No AI calls are made — this runs entirely on the already-received response.
 */
export function evaluateAiOutput(
  response: AiDiagnosisResponse,
  scenario: AiScenario,
): EvaluationResult {
  const checks: CheckResult[] = [];

  // 1. primary_issue is non-empty and concise
  checks.push(checkPrimaryIssueLength(response));

  // 2. primary_issue contains at least one expected keyword
  checks.push(checkPrimaryKeyword(response, scenario));

  // 3. confidence matches expected level
  checks.push(checkConfidence(response, scenario));

  // 4. evidence has 1–5 items and each is non-trivial
  checks.push(checkEvidence(response));

  // 5. explanation is readable (non-empty, ≤ 120 words, not a generic placeholder)
  checks.push(checkExplanation(response));

  // 6. next_steps are 1–4 actionable items
  checks.push(checkNextSteps(response));

  // 7. No forbidden/hallucinated keywords in any field
  checks.push(checkNoForbiddenKeywords(response, scenario));

  // 8. Evidence items are grounded — not generic filler
  checks.push(checkEvidenceGrounding(response, scenario));

  const passed = checks.filter(c => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  const pass = score >= 75; // must pass ≥ 6/8 checks

  return { scenarioId: scenario.id, scenarioLabel: scenario.label, pass, score, checks };
}

function checkPrimaryIssueLength(r: AiDiagnosisResponse): CheckResult {
  const ok = r.primary_issue.trim().length > 3 && r.primary_issue.length <= 120;
  return {
    name: 'primary_issue non-empty and ≤120 chars',
    pass: ok,
    detail: ok ? `"${r.primary_issue}" (${r.primary_issue.length} chars)` : `Got: "${r.primary_issue}"`,
  };
}

function checkPrimaryKeyword(r: AiDiagnosisResponse, s: AiScenario): CheckResult {
  const lower = r.primary_issue.toLowerCase();
  const hit = s.expectedPrimaryKeywords.some(k => lower.includes(k.toLowerCase()));
  return {
    name: 'primary_issue contains expected keyword',
    pass: hit,
    detail: hit
      ? `Matched keyword in "${r.primary_issue}"`
      : `Expected one of [${s.expectedPrimaryKeywords.join(', ')}] in "${r.primary_issue}"`,
  };
}

function checkConfidence(r: AiDiagnosisResponse, s: AiScenario): CheckResult {
  const pass = r.confidence === s.expectedConfidence;
  return {
    name: `confidence is ${s.expectedConfidence}`,
    pass,
    detail: pass ? `Correct: ${r.confidence}` : `Expected ${s.expectedConfidence}, got ${r.confidence}`,
  };
}

function checkEvidence(r: AiDiagnosisResponse): CheckResult {
  const ok = r.evidence.length >= 1 && r.evidence.length <= 5;
  return {
    name: 'evidence has 1–5 items',
    pass: ok,
    detail: `${r.evidence.length} item(s)`,
  };
}

function checkExplanation(r: AiDiagnosisResponse): CheckResult {
  const words = r.explanation.trim().split(/\s+/).length;
  const notGeneric = !['see below', 'refer to', 'as mentioned', 'consult your'].some(p =>
    r.explanation.toLowerCase().includes(p)
  );
  const ok = words >= 10 && words <= 140 && notGeneric;
  return {
    name: 'explanation readable (10–140 words, not generic)',
    pass: ok,
    detail: ok ? `${words} words` : `${words} words${!notGeneric ? ', contains generic filler' : ''}`,
  };
}

function checkNextSteps(r: AiDiagnosisResponse): CheckResult {
  const ok = r.next_steps.length >= 1 && r.next_steps.length <= 4;
  const allNonEmpty = r.next_steps.every(s => s.trim().length > 5);
  return {
    name: 'next_steps 1–4 actionable items',
    pass: ok && allNonEmpty,
    detail: `${r.next_steps.length} step(s)${!allNonEmpty ? ', some too short' : ''}`,
  };
}

function checkNoForbiddenKeywords(r: AiDiagnosisResponse, s: AiScenario): CheckResult {
  const allText = [r.primary_issue, r.explanation, ...r.evidence, ...r.next_steps].join(' ').toLowerCase();
  const found = s.forbiddenKeywords.filter(k => allText.includes(k.toLowerCase()));
  return {
    name: 'no forbidden/hallucinated keywords',
    pass: found.length === 0,
    detail: found.length === 0 ? 'Clean' : `Found: ${found.join(', ')}`,
  };
}

function checkEvidenceGrounding(r: AiDiagnosisResponse, s: AiScenario): CheckResult {
  // Evidence items must not be pure generic phrases with no DTC/signal reference
  const genericPhrases = ['vehicle has a fault', 'see diagnostics', 'check engine', 'further testing required'];
  const genericCount = r.evidence.filter(e =>
    genericPhrases.some(g => e.toLowerCase().includes(g))
  ).length;
  const pass = genericCount === 0;
  return {
    name: 'evidence items grounded (no generic filler)',
    pass,
    detail: pass ? 'All evidence items specific' : `${genericCount} generic item(s) found`,
  };
}
