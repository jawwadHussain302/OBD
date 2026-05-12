export type RepairEffectiveness = 'successful' | 'partial' | 'no_change' | 'worsened';

export interface SessionComparisonResult {
  /** DTCs present in the earlier session but gone in the later one. */
  fixedIssues: string[];
  /** DTCs present in both sessions. */
  stillPresent: string[];
  /** DTCs that appeared only in the later session. */
  newIssues: string[];
  /** Metrics that improved between the two sessions (severity, confidence). */
  improvedMetrics: string[];
  /** Metrics that worsened between the two sessions. */
  worsenedMetrics: string[];
  /** Findings that did not change meaningfully. */
  unchangedFindings: string[];
  /** Plain-English summary of what changed. */
  overallConclusion: string;
  repairEffectiveness: RepairEffectiveness;
}

export interface SessionComparisonError {
  reason: 'vin_mismatch' | 'same_session' | 'insufficient_data';
  message: string;
}

export type SessionComparisonOutcome =
  | { ok: true;  result: SessionComparisonResult }
  | { ok: false; error: SessionComparisonError };
