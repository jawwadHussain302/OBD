/**
 * Represents the outcome of a diagnostic rule evaluation.
 */
export interface DiagnosticResult {
  issueId: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  confidence: number;
  evidence: string[];
  explanation: string;
  recommendedNextStep: string;
  createdAt: number;
}
