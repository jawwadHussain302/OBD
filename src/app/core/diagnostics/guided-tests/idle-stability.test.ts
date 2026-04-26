import { GuidedTest, GuidedTestResult } from '../guided-test.service';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';

export const idleStabilityTest: GuidedTest = {
  id: 'idle_stability',
  name: 'Idle Stability Test',
  durationMs: 10000,
  
  evaluate(frames: ObdLiveFrame[]): GuidedTestResult {
    if (!frames || frames.length < 5) {
      return {
        status: 'fail',
        summary: 'Not enough data',
        details: ['The test requires at least 5 frames of data to evaluate idle stability.'],
        confidence: 1.0
      };
    }

    const rpmValues = frames.map(f => f.rpm);
    const stftValues = frames.map(f => f.stftB1);
    const ltftValues = frames.map(f => f.ltftB1);

    // Compute RPM stats
    const rpmMean = rpmValues.reduce((sum, val) => sum + val, 0) / rpmValues.length;
    const rpmVariance = rpmValues.reduce((sum, val) => sum + Math.pow(val - rpmMean, 2), 0) / rpmValues.length;
    const rpmStdDev = Math.sqrt(rpmVariance);

    // Compute Fuel Trim averages
    const avgStft = stftValues.reduce((sum, val) => sum + val, 0) / stftValues.length;
    const avgLtft = ltftValues.reduce((sum, val) => sum + val, 0) / ltftValues.length;

    const details: string[] = [];
    let status: 'pass' | 'warning' | 'fail' = 'pass';
    let summary = 'Idle is stable and fuel trims are normal.';

    details.push(`RPM Mean: ${rpmMean.toFixed(0)} rpm, StdDev: ${rpmStdDev.toFixed(1)}`);
    details.push(`Average STFT: ${avgStft.toFixed(1)}%, Average LTFT: ${avgLtft.toFixed(1)}%`);

    if (rpmStdDev > 150) {
      status = 'warning';
      summary = 'Unstable idle detected.';
      details.push('RPM fluctuation is high, indicating an unstable idle.');
    }

    if (avgStft > 10 || avgLtft > 10) {
      status = 'warning';
      summary = 'Possible lean condition detected.';
      details.push('Fuel trims are elevated (lean condition / possible vacuum leak).');
    } else if (avgStft < -10 || avgLtft < -10) {
      status = 'warning';
      summary = 'Possible rich condition detected.';
      details.push('Fuel trims are unusually low (rich condition).');
    }

    if (status === 'warning' && rpmStdDev > 150 && (Math.abs(avgStft) > 10 || Math.abs(avgLtft) > 10)) {
       summary = 'Unstable idle with abnormal fuel trims detected.';
    }

    return {
      status,
      summary,
      details,
      confidence: 0.85
    };
  }
};
