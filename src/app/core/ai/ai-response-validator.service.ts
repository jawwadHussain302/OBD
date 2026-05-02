import { Injectable } from '@angular/core';
import { AiDiagnosisResponse } from './ai-diagnosis.models';

@Injectable({ providedIn: 'root' })
export class AiResponseValidatorService {

  /**
   * Parses and validates raw model output against the AiDiagnosisResponse schema.
   * Returns a clean, clamped object on success, or null if validation fails.
   */
  validate(raw: string): AiDiagnosisResponse | null {
    let parsed: unknown;
    try {
      // Strip any accidental markdown fences the model may have added
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }

    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    const primaryIssue = this.requireString(obj, 'primary_issue');
    if (!primaryIssue) return null;

    const explanation = this.requireString(obj, 'explanation');
    if (!explanation) return null;

    const confidence = this.coerceConfidence(obj['confidence']);
    const evidence   = this.coerceStringArray(obj['evidence'],   5);
    const nextSteps  = this.coerceStringArray(obj['next_steps'], 4);

    // Need at least one evidence item and one next step
    if (!evidence.length || !nextSteps.length) return null;

    return {
      primary_issue: primaryIssue.slice(0, 120),
      confidence,
      evidence,
      explanation: explanation.slice(0, 800),
      next_steps: nextSteps,
    };
  }

  private requireString(obj: Record<string, unknown>, key: string): string | null {
    const val = obj[key];
    return typeof val === 'string' && val.trim() ? val.trim() : null;
  }

  private coerceConfidence(val: unknown): 'High' | 'Medium' | 'Low' {
    if (val === 'High' || val === 'Medium' || val === 'Low') return val;
    return 'Low';
  }

  private coerceStringArray(val: unknown, maxItems: number): string[] {
    if (!Array.isArray(val)) return [];
    return val
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map(v => v.trim().slice(0, 200))
      .slice(0, maxItems);
  }
}
