import { Injectable, isDevMode } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import { AiEvidence, AiInsight } from './ai-diagnosis.models';
import { EvidenceBuilderService } from './evidence-builder.service';
import { AiResponseValidatorService } from './ai-response-validator.service';
import { AiFallbackService } from './ai-fallback.service';
import { AiUsageTrackerService } from './ai-usage-tracker.service';
import { AI_DIAGNOSIS_FUNCTION_URL } from './ai-endpoint.config';

const IDLE_INSIGHT: AiInsight = { status: 'idle', response: null, generatedAt: null, isFallback: false };

type FirebaseConfidence = 'low' | 'medium' | 'high';

interface FirebaseDiagnosisResponse {
  requestId: string;
  primary_issue: string;
  confidence: FirebaseConfidence | string;
  explanation: string;
  next_steps: string[];
  warnings?: string[];
  evidence: string[];
}

export interface AiDebugSnapshot {
  evidence: AiEvidence | null;
  // userMessage is built server-side; null here is expected after the backend migration.
  userMessage: string | null;
  rawResponse: string | null;
  validationPassed: boolean | null;
}

/**
 * Orchestrates the full AI diagnosis flow via Firebase backend:
 *   evidence → quota check → Firebase function (builds prompt internally) → validate → (fallback on any failure)
 *
 * Usage tracking rules:
 * - increment() is called ONLY when the Firebase call succeeds with a valid response
 * - Fallback paths (quota_exceeded, validation fail, network error) do NOT increment
 * - If quota is exceeded the API call is skipped and fallback is used immediately
 */
@Injectable({ providedIn: 'root' })
export class AiDiagnosisService {

  private insightSubject = new BehaviorSubject<AiInsight>(IDLE_INSIGHT);
  readonly insight$: Observable<AiInsight> = this.insightSubject.asObservable();

  private debugSubject = new BehaviorSubject<AiDebugSnapshot>({
    evidence: null, userMessage: null, rawResponse: null, validationPassed: null,
  });
  readonly debug$: Observable<AiDebugSnapshot> = this.debugSubject.asObservable();

  private generation = 0;

  constructor(
    private evidenceBuilder: EvidenceBuilderService,
    private validator: AiResponseValidatorService,
    private fallback: AiFallbackService,
    private usageTracker: AiUsageTrackerService,
  ) {}

  reset(): void {
    this.generation++;
    this.insightSubject.next(IDLE_INSIGHT);
    if (isDevMode()) {
      this.debugSubject.next({ evidence: null, userMessage: null, rawResponse: null, validationPassed: null });
    }
  }

  async analyse(state: DeepDiagnosisState): Promise<void> {
    if (state.status !== 'completed') return;

    const thisGeneration = ++this.generation;
    this.insightSubject.next({ status: 'loading', response: null, generatedAt: null, isFallback: false });

    const evidence = this.evidenceBuilder.build(state);

    // ── Quota exceeded — skip API call, use fallback ──────────────────────────
    if (!this.usageTracker.canMakeCall()) {
      if (this.generation !== thisGeneration) return;
      if (isDevMode()) this.debugSubject.next({ evidence, userMessage: null, rawResponse: null, validationPassed: null });
      const stats = this.usageTracker.getStats();
      this.insightSubject.next({
        status: 'quota_exceeded',
        response: this.fallback.generate(evidence),
        generatedAt: Date.now(),
        isFallback: true,
        errorMessage: `Monthly AI quota reached (${stats.used}/${stats.limit}). Resets ${this.nextResetLabel()}.`,
      });
      return;
    }

    // ── Firebase function call ────────────────────────────────────────────────
    try {
      if (isDevMode()) this.debugSubject.next({ evidence, userMessage: null, rawResponse: null, validationPassed: null });

      const { raw, warnings } = await this.callFirebaseFunction(evidence);
      if (this.generation !== thisGeneration) return;

      const validated = this.validator.validate(raw);
      if (isDevMode()) this.debugSubject.next({ evidence, userMessage: null, rawResponse: raw, validationPassed: !!validated });

      if (validated) {
        if (warnings.length) {
          this.insightSubject.next({
            status: 'fallback',
            response: validated,
            generatedAt: Date.now(),
            isFallback: true,
            errorMessage: warnings.join(' '),
          });
        } else {
          this.usageTracker.increment();
          this.insightSubject.next({ status: 'ready', response: validated, generatedAt: Date.now(), isFallback: false });
        }
      } else {
        this.insightSubject.next({
          status: 'fallback',
          response: this.fallback.generate(evidence),
          generatedAt: Date.now(),
          isFallback: true,
          errorMessage: 'AI response did not match the required format.',
        });
      }
    } catch (err) {
      if (this.generation !== thisGeneration) return;
      const message = err instanceof Error ? err.message : 'AI service unavailable.';
      this.insightSubject.next({
        status: 'fallback',
        response: this.fallback.generate(evidence),
        generatedAt: Date.now(),
        isFallback: true,
        errorMessage: message,
      });
    }
  }

  private nextResetLabel(): string {
    const now = new Date();
    const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return reset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  private async callFirebaseFunction(evidence: AiEvidence): Promise<{ raw: string; warnings: string[] }> {
    const body = {
      evidence,
      context: { source: 'obd-dashboard' },
    };

    const res = await fetch(AI_DIAGNOSIS_FUNCTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string })?.error ?? `Service error ${res.status}`);
    }

    const data = await res.json() as FirebaseDiagnosisResponse;

    // Firebase returns lowercase confidence ("low"|"medium"|"high").
    // The local validator expects title case ("Low"|"Medium"|"High"); normalize here.
    const c = (data.confidence ?? '').toLowerCase();
    const confidence = c === 'high' ? 'High' : c === 'medium' ? 'Medium' : 'Low';

    const warnings = Array.isArray(data.warnings)
      ? data.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
      : [];

    return {
      raw: JSON.stringify({ ...data, confidence }),
      warnings,
    };
  }
}
