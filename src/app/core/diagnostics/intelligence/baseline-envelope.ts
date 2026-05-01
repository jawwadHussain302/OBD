import { BaselineEnvelope } from './diagnosis-intelligence.models';

export type { BaselineEnvelope };

export const DEFAULT_BASELINE: BaselineEnvelope = {
  idleStability: { maxStdDev: 150 },
  revResponse:   { maxRiseTimeMs: 3000, maxOvershoot: 500 },
  holdStability: { maxStdDev: 200 },
  decelPattern:  { maxDropRatePerSec: 1000 },
};
