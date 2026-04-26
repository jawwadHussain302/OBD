import { GuidedTest, GuidedTestResult } from '../guided-test.service';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';

const MIN_FRAMES = 10;
const SLOW_RISE_THRESHOLD_C = 10;
const NO_RISE_THRESHOLD_C = 2;
const HIGH_TOTAL_TRIM_THRESHOLD = 10;

export const warmupTest: GuidedTest = {
  id: 'warmup_test',
  name: 'Engine Warm-up Test',
  durationMs: 120000,

  evaluate(frames: ObdLiveFrame[]): GuidedTestResult {
    if (!frames || frames.length < MIN_FRAMES) {
      return {
        status: 'fail',
        summary: 'Not enough data',
        details: [`The test requires at least ${MIN_FRAMES} frames to evaluate engine warm-up.`],
        confidence: 1.0
      };
    }

    const windowSize = Math.max(1, Math.floor(frames.length * 0.25));
    const earlyFrames = frames.slice(0, windowSize);
    const lateFrames = frames.slice(-windowSize);

    const startTemp = average(earlyFrames.map(f => f.coolantTemp));
    const endTemp = average(lateFrames.map(f => f.coolantTemp));
    const tempRise = endTemp - startTemp;
    const lateTotalTrim = average(lateFrames.map(f => f.stftB1 + f.ltftB1));

    const details = [
      `Start coolant average: ${startTemp.toFixed(1)} C`,
      `End coolant average: ${endTemp.toFixed(1)} C`,
      `Coolant rise: ${tempRise.toFixed(1)} C`,
      `Late total fuel trim: ${lateTotalTrim.toFixed(1)}%`
    ];

    if (tempRise < NO_RISE_THRESHOLD_C) {
      return {
        status: 'fail',
        summary: 'Coolant temperature did not increase.',
        details,
        confidence: 0.85
      };
    }

    if (tempRise < SLOW_RISE_THRESHOLD_C) {
      return {
        status: 'warning',
        summary: 'Coolant temperature rose too slowly.',
        details,
        confidence: 0.75
      };
    }

    if (Math.abs(lateTotalTrim) > HIGH_TOTAL_TRIM_THRESHOLD) {
      return {
        status: 'warning',
        summary: 'Fuel trims remained high after warm-up.',
        details,
        confidence: 0.75
      };
    }

    return {
      status: 'pass',
      summary: 'Engine warm-up behavior looks normal.',
      details,
      confidence: 0.85
    };
  }
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
