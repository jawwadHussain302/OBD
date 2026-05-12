import { Injectable, inject } from '@angular/core';
import { AiDiagnosisService } from '../ai-diagnosis.service';
import type { AiEvidence, AiInsight } from '../ai-diagnosis.models';
import type { DeepDiagnosisState } from '../../diagnostics/deep-diagnosis.service';
import { DtcCode } from '../../diagnostics/dtc/dtc-code.model';
import { DiagnosisSeverity, RootCauseCandidate } from '../../diagnostics/intelligence/diagnosis-intelligence.models';
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
      // Wait for terminal states produced by the current Firebase-backed flow.
      const insight = await firstValueFrom(
        this.aiService.insight$.pipe(
          filter(i => i.status === 'ready' || i.status === 'fallback' || i.status === 'quota_exceeded')
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      return {
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        expectedPrimaryKeywords: scenario.expectedPrimaryKeywords,
        evaluation: null,
        insight: null,
        error: message
      };
    }
  }

  /**
   * Constructs a DeepDiagnosisState that will map closely back to the original AiEvidence
   * when passed through the EvidenceBuilderService.
   * Note: This mapping ensures AiDiagnosisService can run normally without mocking core services.
   */
  private buildMockDiagnosisState(evidence: AiEvidence): DeepDiagnosisState {
    const rootCauses: RootCauseCandidate[] = [];

    if (evidence.primaryCause) {
      rootCauses.push({
        title: evidence.primaryCause.title,
        confidence: evidence.primaryCause.confidence,
        explanation: evidence.primaryCause.explanation,
        rank: 1,
        supportingEvidence: [],
      });
    }

    evidence.additionalCauses.forEach((cause, idx) => {
      rootCauses.push({
        title: cause.title,
        confidence: cause.confidence,
        explanation: '',
        rank: idx + 2,
        supportingEvidence: [],
      });
    });

    const dtcFindings = [
      ...(evidence.fuelTrimNote ? [evidence.fuelTrimNote] : []),
      ...(evidence.idleStabilityNote ? [evidence.idleStabilityNote] : []),
    ];

    const state: DeepDiagnosisState = {
      status: 'completed',
      currentStep: 'completed',
      instruction: 'QA fixture diagnosis complete.',
      progress: 100,
      results: [],
      dtcCodes: evidence.dtcs.map(d => this.toDtcCode(d)),
      severity: { score: evidence.severityScore, level: this.toSeverityLevel(evidence.severityLevel) },
      rootCauses,
      correlationFindings: evidence.correlationFindings.map(msg => ({
        codes: [],
        message: msg,
        upgradesSeverity: false,
        confidence: 'Medium',
      })),
      recommendations: {
        recommendedChecks: evidence.recommendedChecks,
        nextSteps: []
      },
      isPartial: evidence.isPartial,
      findings: [],
      dtcFindings,
    };

    return state;
  }

  private toDtcCode(dtc: AiEvidence['dtcs'][number]): DtcCode {
    return {
      code: dtc.code,
      title: dtc.title,
      description: dtc.title,
      severity: this.toDtcSeverity(dtc.severity),
      subsystem: 'Engine',
      source: 'generic',
    };
  }

  private toDtcSeverity(severity: string | undefined): DtcCode['severity'] {
    if (severity === 'Low' || severity === 'Medium' || severity === 'High' ||
        severity === 'Critical' || severity === 'Unknown') {
      return severity;
    }
    return undefined;
  }

  private toSeverityLevel(level: string): DiagnosisSeverity['level'] {
    if (level === 'Medium' || level === 'High' || level === 'Critical') return level;
    return 'Low';
  }
}
