import { GuidedTest, GuidedTestResult } from '../guided-test.service';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';

const REV_MIN = 1800;   // RPM — lower bound of target range
const REV_MAX = 3200;   // RPM — upper bound of target range
const HOLD_MS = 2500;   // minimum time RPM must stay in range to count as a valid hold

export const revTest: GuidedTest = {
  id: 'rev_test',
  name: 'Engine Response Test',
  // 20 s gives sufficient time to reach ~2500 RPM and hold.
  // Previously 12 s — too short when the warmup + idle steps have already
  // consumed several minutes and the driver is repositioning.
  durationMs: 20000,

  evaluate(frames: ObdLiveFrame[]): GuidedTestResult {
    if (!frames || frames.length < 3) {
      return {
        status: 'fail',
        summary: 'Rev not detected — no OBD data received during test.',
        details: ['Check adapter connection and retry.'],
        confidence: 1.0,
      };
    }

    // ── Check whether RPM ever reached the target range ─────────
    const anyInRange = frames.some(f => f.rpm >= REV_MIN && f.rpm <= REV_MAX);
    if (!anyInRange) {
      return {
        status: 'fail',
        summary: `Rev not detected. Please raise and hold RPM around 2500.`,
        details: [
          `Engine RPM did not reach the ${REV_MIN}–${REV_MAX} RPM target range.`,
          'Gradually rev to ~2500 RPM and hold for a few seconds.',
        ],
        confidence: 1.0,
      };
    }

    // ── Check longest consecutive hold within range ──────────────
    let holdStart: number | null = null;
    let maxHoldMs = 0;

    for (const f of frames) {
      if (f.rpm >= REV_MIN && f.rpm <= REV_MAX) {
        if (holdStart === null) holdStart = f.timestamp;
        maxHoldMs = Math.max(maxHoldMs, f.timestamp - holdStart);
      } else {
        holdStart = null;
      }
    }

    if (maxHoldMs < HOLD_MS) {
      return {
        status: 'warning',
        summary: 'RPM briefly entered range but was not held long enough.',
        details: [
          `Hold RPM between ${REV_MIN}–${REV_MAX} for at least ${HOLD_MS / 1000} seconds to complete the test.`,
          `Longest hold detected: ${(maxHoldMs / 1000).toFixed(1)} s.`,
        ],
        confidence: 0.65,
      };
    }

    // ── Detailed analysis on frames within range ─────────────────
    const revFrames = frames.filter(f => f.rpm >= REV_MIN && f.rpm <= REV_MAX);

    const rpmValues = frames.map(f => f.rpm);
    const minRpm = Math.min(...rpmValues);
    const maxRpm = Math.max(...rpmValues);

    const throttleValues = frames.map(f => f.throttlePosition);
    const minThrottle = Math.min(...throttleValues);
    const maxThrottle = Math.max(...throttleValues);

    const loadValues = revFrames.map(f => f.engineLoad);
    const maxLoad = Math.max(...loadValues);

    const mafValues = frames.map(f => f.maf).filter((m): m is number => m !== undefined);
    const minMaf = mafValues.length > 0 ? Math.min(...mafValues) : undefined;
    const maxMaf = mafValues.length > 0 ? Math.max(...mafValues) : undefined;

    let status: 'pass' | 'warning' | 'fail' = 'pass';
    const details: string[] = [];

    if ((maxThrottle - minThrottle) > 10 && (maxRpm - minRpm) < 300) {
      status = 'warning';
      details.push('Throttle input not reflected in RPM.');
    }

    if ((maxRpm - minRpm) > 500 && maxLoad < 20) {
      status = 'warning';
      details.push('Possible airflow restriction (engine load stayed low under rev).');
    }

    if (minMaf !== undefined && maxMaf !== undefined) {
      if ((maxRpm - minRpm) > 500 && (maxMaf - minMaf) < 3) {
        status = 'warning';
        details.push('Airflow not matching RPM (MAF response is sluggish).');
      }
    }

    for (const f of frames) {
      if (Math.abs(f.stftB1) > 12 || Math.abs(f.ltftB1) > 12) {
        status = 'warning';
        details.push('Fueling unstable under load (trims spiked > ±12%).');
        break;
      }
    }

    const summary = status === 'warning'
      ? 'Abnormal engine response detected during rev.'
      : 'Engine responds normally under load.';

    return {
      status,
      summary,
      details: details.length > 0 ? details : undefined,
      confidence: 0.85,
    };
  },
};
