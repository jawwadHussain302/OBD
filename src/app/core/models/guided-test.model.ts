export interface GuidedTestResult {
  testName: string;
  startedAt: number;
  completedAt: number;
  diagnosis: string;
  confidence: number;
  evidence: string[];
  explanation: string;
  recommendedNextSteps: string[];
}
