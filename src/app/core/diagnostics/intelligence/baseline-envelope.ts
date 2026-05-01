import { BaselineEnvelope } from './diagnosis-intelligence.models';

export type { BaselineEnvelope };

export const DEFAULT_BASELINE: BaselineEnvelope = {
  idleStability: { maxVariance: 150 },
  revResponse:   { maxRiseTimeMs: 3000, maxOvershoot: 500 },
  holdStability: { maxVariance: 200 },
  decelPattern:  { maxDropRatePerSec: 1000 },
};
