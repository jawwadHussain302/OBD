import { AiEvidence } from './ai-diagnosis.models';

type ConfidenceLevel = 'High' | 'Medium' | 'Low';

const LEVELS: ConfidenceLevel[] = ['Low', 'Medium', 'High'];

function raise(c: ConfidenceLevel): ConfidenceLevel {
  const idx = LEVELS.indexOf(c);
  return LEVELS[Math.min(idx + 1, LEVELS.length - 1)];
}

function lower(c: ConfidenceLevel): ConfidenceLevel {
  const idx = LEVELS.indexOf(c);
  return LEVELS[Math.max(idx - 1, 0)];
}

/**
 * Adjusts the raw primaryCause confidence based on supporting signal evidence.
 *
 * Rules applied in order:
 * 1. Partial diagnosis → reduce one level (incomplete evidence = less certainty).
 * 2. No primary cause identified → always Low.
 * 3. Primary cause confidence is already High AND there is ≥1 confirming correlation
 *    finding → keep High (no further boost needed).
 * 4. Primary cause confidence is Medium AND there are ≥2 confirming signals
 *    (correlation findings + signal notes) → raise to High.
 * 5. Primary cause confidence is High but there are NO confirming correlation
 *    findings and no signal notes → reduce to Medium (single DTC, unconfirmed).
 */
export function tuneConfidence(evidence: AiEvidence): ConfidenceLevel {
  if (!evidence.primaryCause) return 'Low';

  let confidence = evidence.primaryCause.confidence as ConfidenceLevel;

  const confirmingSignals =
    evidence.correlationFindings.length +
    (evidence.fuelTrimNote ? 1 : 0) +
    (evidence.idleStabilityNote ? 1 : 0);

  // Partial diagnosis: always reduce one level
  if (evidence.isPartial) {
    return lower(confidence);
  }

  // Medium confidence + multiple confirming signals → raise to High
  if (confidence === 'Medium' && confirmingSignals >= 2) {
    return raise(confidence);
  }

  // High confidence but no confirming signals → unconfirmed single DTC, reduce
  if (confidence === 'High' && confirmingSignals === 0 && evidence.dtcs.length <= 1) {
    return lower(confidence);
  }

  return confidence;
}
