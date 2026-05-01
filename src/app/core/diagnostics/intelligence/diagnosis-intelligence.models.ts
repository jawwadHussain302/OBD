import { DiagnosisStepId } from '../deep-diagnosis.service';

export type ConfidenceLevel = 'Low' | 'Medium' | 'High';

export interface CorrelationFinding {
  codes: string[];
  message: string;
  upgradesSeverity: boolean;
  confidence?: ConfidenceLevel;
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

// ── Intelligence Sprint models ────────────────────────────────────────────────

export interface DriveSignature {
  idleStability: { stdDev: number; meanRpm: number };
  revResponse: { riseTimeMs: number; overshoot: number };
  holdStability: { stdDev: number; meanRpm: number };
  decelPattern: { dropRatePerSec: number };
}

export interface BaselineEnvelope {
  idleStability: { maxStdDev: number };
  revResponse: { maxRiseTimeMs: number; maxOvershoot: number };
  holdStability: { maxStdDev: number };
  decelPattern: { maxDropRatePerSec: number };
}

export type EvidenceNodeType = 'dtc' | 'signal' | 'signature' | 'hypothesis';

export interface EvidenceNode {
  id: string;
  type: EvidenceNodeType;
  label: string;
}

export interface EvidenceEdge {
  fromId: string;
  toId: string;
  relation: 'supports' | 'contradicts';
  weight: number;
}

export interface EvidenceGraph {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
}

export interface ContradictionFinding {
  description: string;
  nodeALabel: string;
  nodeBLabel: string;
}

export interface Hypothesis {
  id: string;
  title: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  rank: number;
  supports: string[];
  contradictions: string[];
}

export interface HypothesisReport {
  hypotheses: Hypothesis[];
  contradictions: ContradictionFinding[];
  generatedAt: number;
}

// ── #103 Root Cause Inference ─────────────────────────────────────────────────

export interface RootCauseCandidate {
  rank: number;
  title: string;
  explanation: string;
  confidence: ConfidenceLevel;
  supportingEvidence: string[];
}

// ── #106 Test Orchestration ───────────────────────────────────────────────────

export interface TestOrchestrationPlan {
  skipSteps: import('../deep-diagnosis.service').DiagnosisStepId[];
  focusArea: 'general' | 'fuel-trim' | 'misfire' | 'maf' | 'idle';
  priorityReason: string;
}

// ── #107 Repair Insight ───────────────────────────────────────────────────────

export interface RepairStep {
  priority: 'Immediate' | 'Soon' | 'Routine';
  system: string;
  action: string;
  rationale: string;
}

export interface RepairInsightReport {
  steps: RepairStep[];
  generatedAt: number;
}
