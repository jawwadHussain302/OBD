import { DiagnosisStepId } from '../deep-diagnosis.service';

export interface CorrelationFinding {
  codes: string[];
  message: string;
  upgradesSeverity: boolean;
}

export interface DiagnosisSeverity {
  score: number;
  level: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface DiagnosisRecommendation {
  recommendedChecks: string[];
  nextSteps: string[];
}

export interface DiagnosisSummary {
  summaryText: string;
  recommendedAction: string;
}

export interface TimelineEvent {
  timestamp: number;
  step: DiagnosisStepId;
  message: string;
}
