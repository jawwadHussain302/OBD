export interface KnowledgePack {
  id: string;
  title: string;
  hypotheses: Hypothesis[];
  steps: Step[];
}

export interface Hypothesis {
  id: string;
  initialConfidence: number;
}

export interface Step {
  id: string;
  instruction: string;
  question: string;
  options: StepOption[];
}

export interface StepOption {
  label: string;
  effect: Record<string, number>;
  next?: string;
}

export interface DiagnosticState {
  activePackId: string;
  hypothesisScores: Record<string, number>;
  currentStepId: string;
  history: {
    stepId: string;
    selectedOption: string;
  }[];
}
