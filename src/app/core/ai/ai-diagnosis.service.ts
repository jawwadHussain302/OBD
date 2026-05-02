import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import { AiInsight, AiDiagnosisResponse } from './ai-diagnosis.models';
import { EvidenceBuilderService } from './evidence-builder.service';
import { AiPromptService } from './ai-prompt.service';
import { AiResponseValidatorService } from './ai-response-validator.service';
import { AiFallbackService } from './ai-fallback.service';
import { AiConfigService } from './ai-config.service';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const IDLE_INSIGHT: AiInsight = { status: 'idle', response: null, generatedAt: null, isFallback: false };

/**
 * Orchestrates the full AI diagnosis flow:
 *   evidence → prompt → API call → validate → (fallback on any failure)
 *
 * Non-blocking: the component subscribes to insight$ and the state
 * updates asynchronously. If no API key is set, goes directly to fallback.
 */
@Injectable({ providedIn: 'root' })
export class AiDiagnosisService {

  private insightSubject = new BehaviorSubject<AiInsight>(IDLE_INSIGHT);
  readonly insight$: Observable<AiInsight> = this.insightSubject.asObservable();

  constructor(
    private evidenceBuilder: EvidenceBuilderService,
    private promptService: AiPromptService,
    private validator: AiResponseValidatorService,
    private fallback: AiFallbackService,
    private config: AiConfigService,
  ) {}

  reset(): void {
    this.insightSubject.next(IDLE_INSIGHT);
  }

  /** Trigger after a diagnosis completes. Non-blocking — sets loading then resolves async. */
  async analyse(state: DeepDiagnosisState): Promise<void> {
    if (state.status !== 'completed') return;

    this.insightSubject.next({ status: 'loading', response: null, generatedAt: null, isFallback: false });

    const evidence = this.evidenceBuilder.build(state);
    const apiKey = this.config.getKey();

    if (!apiKey) {
      this.insightSubject.next({
        status: 'no_key',
        response: this.fallback.generate(evidence),
        generatedAt: Date.now(),
        isFallback: true,
      });
      return;
    }

    try {
      const userMessage = this.promptService.buildUserMessage(evidence);
      const raw = await this.callApi(apiKey, userMessage);
      const validated = this.validator.validate(raw);

      if (validated) {
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
