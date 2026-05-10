// ── Evidence sent to Firebase /aiDiagnose ─────────────────────────────────────
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

// ── Validated AI response ─────────────────────────────────────────────────────
export interface AiDiagnosisResponse {
  requestId: string;
  primary_issue: string;
  confidence: 'low' | 'medium' | 'high';
  explanation: string;
  next_steps: string[];
  warnings: string[];
  evidence: string[];
}

// ── AI insight attached to a completed diagnosis ───────────────────────────────
export type AiInsightStatus = 'idle' | 'loading' | 'ready' | 'fallback' | 'error';

export interface AiInsight {
  status: AiInsightStatus;
  response: AiDiagnosisResponse | null;
  generatedAt: number | null;
  isFallback: boolean;
  errorMessage?: string;
}
