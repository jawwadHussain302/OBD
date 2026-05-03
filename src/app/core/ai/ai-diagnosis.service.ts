import { Injectable, isDevMode } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import { AiEvidence, AiInsight } from './ai-diagnosis.models';
import { EvidenceBuilderService } from './evidence-builder.service';
import { AiPromptService } from './ai-prompt.service';
import { AiResponseValidatorService } from './ai-response-validator.service';
import { AiFallbackService } from './ai-fallback.service';
import { AiConfigService } from './ai-config.service';
import { AiUsageTrackerService } from './ai-usage-tracker.service';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const IDLE_INSIGHT: AiInsight = { status: 'idle', response: null, generatedAt: null, isFallback: false };

export interface AiDebugSnapshot {
  evidence: AiEvidence | null;
  userMessage: string | null;
  rawResponse: string | null;
  validationPassed: boolean | null;
}

/**
 * Orchestrates the full AI diagnosis flow:
 *   evidence → prompt → quota check → API call → validate → (fallback on any failure)
 *
 * Usage tracking rules:
 * - increment() is called ONLY when callApi() succeeds with a valid response
 * - Fallback paths (no_key, quota_exceeded, validation fail, API error) do NOT increment
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
    private promptService: AiPromptService,
    private validator: AiResponseValidatorService,
    private fallback: AiFallbackService,
    private config: AiConfigService,
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
    const apiKey   = this.config.getKey();

    // ── No API key ────────────────────────────────────────────────────────────
    if (!apiKey) {
      if (this.generation !== thisGeneration) return;
      if (isDevMode()) this.debugSubject.next({ evidence, userMessage: null, rawResponse: null, validationPassed: null });
      this.insightSubject.next({
        status: 'no_key',
        response: this.fallback.generate(evidence),
        generatedAt: Date.now(),
        isFallback: true,
      });
      return;
    }

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

    // ── Live API call ─────────────────────────────────────────────────────────
    try {
      const userMessage = this.promptService.buildUserMessage(evidence);
      if (isDevMode()) this.debugSubject.next({ evidence, userMessage, rawResponse: null, validationPassed: null });

      const raw = await this.callApi(apiKey, userMessage);
      if (this.generation !== thisGeneration) return;

      const validated = this.validator.validate(raw);
      if (isDevMode()) this.debugSubject.next({ evidence, userMessage, rawResponse: raw, validationPassed: !!validated });

      if (validated) {
        // Only increment on a real successful AI call with a valid response
        this.usageTracker.increment();
        this.insightSubject.next({ status: 'ready', response: validated, generatedAt: Date.now(), isFallback: false });
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

  private async callApi(apiKey: string, userMessage: string): Promise<string> {
    const body = {
      model: MODEL,
      max_tokens: 512,
      system: this.promptService.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    };

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any)?.error?.message ?? `API error ${res.status}`);
    }

    const data = await res.json() as { content: { type: string; text: string }[] };
    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock?.text) throw new Error('Empty response from AI.');
    return textBlock.text;
  }
}
