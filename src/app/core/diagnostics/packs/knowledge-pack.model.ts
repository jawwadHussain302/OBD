// ── KnowledgePack — guided hypothesis-scoring diagnostic workflow ─────────────

/** A hypothesis the pack tracks and updates as the user answers questions. */
export interface Hypothesis {
  id: string;
  label: string;
  score: number;  // 0–1, higher = more likely
}

/** A single answer option that updates hypothesis scores. */
export interface StepOption {
  label: string;
  /** Score deltas keyed by hypothesis id. Positive = more likely, negative = less likely. */
  scoreDeltas: Record<string, number>;
  /** Optional human-readable reasoning shown after selection. */
  note?: string;
}

/** One step in the diagnostic flow. */
export interface DiagnosticStep {
  id: string;
  /** Short mechanic instruction (what to do before answering). */
  instruction: string;
  /** Question the mechanic answers. */
  question: string;
  options: StepOption[];
  /** Optional next-step override keyed by selected option label. Defaults to sequential order. */
  nextStepId?: string;
}

/** Complete diagnostic pack state after applying answers. */
export interface PackState {
  hypotheses: Hypothesis[];
  completedSteps: string[];
  currentStepIndex: number;
  isComplete: boolean;
  primaryHypothesis: Hypothesis | null;
}

/** A self-contained diagnostic workflow pack. */
export interface KnowledgePack {
  id: string;
  name: string;
  description: string;
  symptomTags: string[];
  /** Initial hypothesis scores (must sum to 1.0 if balanced). */
  initialHypotheses: Hypothesis[];
  steps: DiagnosticStep[];
}

// ── Pack runner — applies answers to produce updated state ────────────────────

export function createPackState(pack: KnowledgePack): PackState {
  return {
    hypotheses: pack.initialHypotheses.map(h => ({ ...h })),
    completedSteps: [],
    currentStepIndex: 0,
    isComplete: false,
    primaryHypothesis: null,
  };
}

export function applyAnswer(
  state: PackState,
  pack: KnowledgePack,
  option: StepOption,
): PackState {
  const step = pack.steps[state.currentStepIndex];
  if (!step) return state;

  // Apply score deltas and clamp 0–1
  const hypotheses = state.hypotheses.map(h => {
    const delta = option.scoreDeltas[h.id] ?? 0;
    return { ...h, score: Math.max(0, Math.min(1, h.score + delta)) };
  });

  const completedSteps = [...state.completedSteps, step.id];
  const nextIndex      = state.currentStepIndex + 1;
  const isComplete     = nextIndex >= pack.steps.length;

  const sorted         = [...hypotheses].sort((a, b) => b.score - a.score);
  const primaryHypothesis = sorted[0] ?? null;

  return { hypotheses, completedSteps, currentStepIndex: nextIndex, isComplete, primaryHypothesis };
}
