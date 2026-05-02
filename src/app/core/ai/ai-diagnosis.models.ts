// ── Evidence packet sent to the AI ───────────────────────────────────────────

/** Compact, structured evidence built from a completed DeepDiagnosisState.
 *  Only contains data that exists in the diagnosis — no raw logs or sensor streams. */
export interface AiEvidence {
  severityScore: number;
  severityLevel: string;
  dtcs: { code: string; title: string; severity?: string }[];
  primaryCause: { title: string; confidence: string; explanation: string } | null;
  additionalCauses: { title: string; confidence: string }[];
  correlationFindings: string[];
  recommendedChecks: string[];
  fuelTrimNote: string | null;
  idleStabilityNote: string | null;
  isPartial: boolean;
}

// ── Validated AI response schema ──────────────────────────────────────────────

export interface AiDiagnosisResponse {
  primary_issue: string;
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string[];       // 1–5 items grounded in provided data
  explanation: string;      // plain-English, ≤120 words
  next_steps: string[];     // 1–4 ordered action items
}

// ── AI insight state attached to a completed diagnosis ────────────────────────

export type AiInsightStatus = 'idle' | 'loading' | 'ready' | 'fallback' | 'no_key' | 'error';

export interface AiInsight {
  status: AiInsightStatus;
  response: AiDiagnosisResponse | null;
  generatedAt: number | null;
  /** True when the response came from the deterministic fallback, not the model */
  isFallback: boolean;
  errorMessage?: string;
}
