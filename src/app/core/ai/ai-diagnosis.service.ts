import { Injectable, isDevMode } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import { AiDiagnosisResponse, AiEvidence, AiInsight } from './ai-diagnosis.models';
import { AiEvidenceBuilderService } from './ai-evidence-builder.service';

// ── Endpoint config ───────────────────────────────────────────────────────────
// Set FIREBASE_AI_URL to the deployed function URL.
// For emulator: http://127.0.0.1:5001/obd-dashboard/us-central1/aiDiagnose
// For production: https://us-central1-obd-dashboard.cloudfunctions.net/aiDiagnose
const FIREBASE_AI_URL: string = isDevMode()
  ? 'http://127.0.0.1:5001/obd-dashboard/us-central1/aiDiagnose'
  : 'https://us-central1-obd-dashboard.cloudfunctions.net/aiDiagnose';

const IDLE_INSIGHT: AiInsight = {
  status: 'idle',
  response: null,
  generatedAt: null,
  isFallback: false,
};

/**
 * Orchestrates AI diagnosis by calling the Firebase /aiDiagnose function.
 *
 * Responsibility split:
 *  - Frontend  → builds evidence, calls Firebase
 *  - Firebase  → builds prompt, calls OpenRouter, returns response
 *
 * No API key ever touches the browser.
 */
@Injectable({ providedIn: 'root' })
export class AiDiagnosisService {

  private insightSubject = new BehaviorSubject<AiInsight>(IDLE_INSIGHT);
  readonly insight$: Observable<AiInsight> = this.insightSubject.asObservable();

  private generation = 0;

  constructor(
    private evidenceBuilder: AiEvidenceBuilderService,
  ) {}

  reset(): void {
    this.generation++;
    this.insightSubject.next(IDLE_INSIGHT);
  }

  async analyse(state: DeepDiagnosisState, vehicleName?: string): Promise<void> {
    if (state.status !== 'completed') return;

    const thisGeneration = ++this.generation;
    this.insightSubject.next({ status: 'loading', response: null, generatedAt: null, isFallback: false });

    const evidence = this.evidenceBuilder.build(state);

    try {
      const response = await this.callFirebase(evidence, vehicleName);
      if (this.generation !== thisGeneration) return;

      this.insightSubject.next({
        status: response.requestId ? 'ready' : 'fallback',
        response,
        generatedAt: Date.now(),
        isFallback: false,
      });
    } catch (err) {
      if (this.generation !== thisGeneration) return;
      const message = err instanceof Error ? err.message : 'AI service unavailable.';
      this.insightSubject.next({
        status: 'error',
        response: null,
        generatedAt: Date.now(),
        isFallback: false,
        errorMessage: message,
      });
    }
  }

  private async callFirebase(
    evidence: AiEvidence,
    vehicleName?: string,
  ): Promise<AiDiagnosisResponse> {
    const body = {
      evidence,
      context: {
        vehicle: vehicleName,
        source: 'obd-dashboard',
      },
    };

    const res = await fetch(FIREBASE_AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Firebase function returned ${res.status}`);
    }

    const data = await res.json() as AiDiagnosisResponse;
    if (!data.primary_issue) {
      throw new Error('Invalid response shape from Firebase function');
    }
    return data;
  }
}
