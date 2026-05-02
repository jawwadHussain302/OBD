import { Injectable, inject } from '@angular/core';
import { AiDiagnosisService } from '../ai-diagnosis.service';
import { AiEvidence, AiInsight } from '../ai-diagnosis.models';
import { DeepDiagnosisState } from '../../diagnostics/deep-diagnosis.service';
import { AiScenario, ALL_SCENARIOS } from './scenario-fixtures';
import { evaluateAiOutput, EvaluationResult } from './ai-output-evaluator';
import { firstValueFrom, Observable, BehaviorSubject, filter } from 'rxjs';

export interface QaRunResult {
  scenarioId: string;
  scenarioLabel: string;
  expectedPrimaryKeywords: string[];
  evaluation: EvaluationResult | null;
  insight: AiInsight | null;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AiQaRunnerService {
  private aiService = inject(AiDiagnosisService);

  private resultsSubject = new BehaviorSubject<QaRunResult[]>([]);
  readonly results$ = this.resultsSubject.asObservable();

  private isRunningSubject = new BehaviorSubject<boolean>(false);
  readonly isRunning$ = this.isRunningSubject.asObservable();

  async runAllFixtures(): Promise<void> {
    if (this.isRunningSubject.value) return;
    this.isRunningSubject.next(true);
    this.resultsSubject.next([]);

    const results: QaRunResult[] = [];

    for (const scenario of ALL_SCENARIOS) {
      const result = await this.runFixture(scenario);
      results.push(result);
      this.resultsSubject.next([...results]);
    }

    this.isRunningSubject.next(false);
  }

  private async runFixture(scenario: AiScenario): Promise<QaRunResult> {
    const mockState = this.buildMockDiagnosisState(scenario.evidence);

    // reset service to clear any previous insight
    this.aiService.reset();

    // trigger analysis
    this.aiService.analyse(mockState);

    try {
      // Wait for it to complete (either ready, fallback, or error)
      const insight = await firstValueFrom(
        this.aiService.insight$.pipe(
          filter(i => i.status === 'ready' || i.status === 'fallback' || i.status === 'error')
        )
      );

      let evaluation: EvaluationResult | null = null;
      if (insight.response) {
        evaluation = evaluateAiOutput(insight.response, scenario);
      }

      return {
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        expectedPrimaryKeywords: scenario.expectedPrimaryKeywords,
        evaluation,
        insight
      };
    } catch (err: any) {
      return {
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        expectedPrimaryKeywords: scenario.expectedPrimaryKeywords,
        evaluation: null,
        insight: null,
        error: err.message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Constructs a DeepDiagnosisState that will map closely back to the original AiEvidence
   * when passed through the EvidenceBuilderService.
   * Note: This mapping ensures AiDiagnosisService can run normally without mocking core services.
   */
  private buildMockDiagnosisState(evidence: AiEvidence): DeepDiagnosisState {
    const state: DeepDiagnosisState = {
      status: 'completed',
      step: 'completed',
      dtcCodes: evidence.dtcs.map(d => ({ code: d.code, title: d.title, severity: d.severity as any, system: 'Engine' })),
      severity: { score: evidence.severityScore, level: evidence.severityLevel as any, reasons: [] },
      rootCauses: [],
      correlationFindings: evidence.correlationFindings.map(msg => ({ message: msg, type: 'correlation', confidence: 'Medium' })),
      recommendations: {
        recommendedChecks: evidence.recommendedChecks,
        nextSteps: []
      },
      isPartial: evidence.isPartial,
      findings: [],
      dtcFindings: [],
      // Other state fields are left as default or empty as EvidenceBuilder doesn't heavily depend on them
    } as any; // Using "any" assertion for omitted fields not strictly required by EvidenceBuilder

    if (evidence.primaryCause) {
      state.rootCauses!.push({
        title: evidence.primaryCause.title,
        confidence: evidence.primaryCause.confidence as any,
        explanation: evidence.primaryCause.explanation,
        rank: 1,
        supportingEvidence: []
      });
    }

    evidence.additionalCauses.forEach((cause, idx) => {
      state.rootCauses!.push({
        title: cause.title,
        confidence: cause.confidence as any,
        explanation: '', // fallback to empty string
        rank: idx + 2,
        supportingEvidence: []
      });
    });

    if (evidence.fuelTrimNote) {
      state.dtcFindings!.push(evidence.fuelTrimNote);
    }

    if (evidence.idleStabilityNote) {
      state.dtcFindings!.push(evidence.idleStabilityNote);
    }

    return state;
  }
}
