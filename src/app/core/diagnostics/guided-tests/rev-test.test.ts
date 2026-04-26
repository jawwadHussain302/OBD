import { GuidedTest, GuidedTestResult } from '../guided-test.service';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';

export const revTest: GuidedTest = {
  id: 'rev_test',
  name: 'Engine Response Test',
  durationMs: 12000,
  
  evaluate(frames: ObdLiveFrame[]): GuidedTestResult {
    if (!frames || frames.length < 5) {
      return {
        status: 'fail',
        summary: 'Not enough data',
        details: ['The test requires at least 5 frames of data to evaluate engine response.'],
        confidence: 1.0
      };
    }

    const revvedFrames = frames.filter(f => f.rpm > 2000);
    if (revvedFrames.length === 0) {
      return {
        status: 'fail',
        summary: 'Engine not revved sufficiently',
        details: ['The engine RPM did not exceed 2000 RPM during the test window.'],
        confidence: 1.0
      };
    }

    let status: 'pass' | 'warning' | 'fail' = 'pass';
    const details: string[] = [];

    // Extract ranges for correlation checks
    const rpmValues = frames.map(f => f.rpm);
    const minRpm = Math.min(...rpmValues);
    const maxRpm = Math.max(...rpmValues);

    const throttleValues = frames.map(f => f.throttlePosition);
    const minThrottle = Math.min(...throttleValues);
    const maxThrottle = Math.max(...throttleValues);

    const loadValues = frames.map(f => f.engineLoad);
    const maxLoad = Math.max(...loadValues);

    // MAF is optional, so extract only defined values
    const mafValues = frames.map(f => f.maf).filter((m): m is number => m !== undefined);
    const minMaf = mafValues.length > 0 ? Math.min(...mafValues) : undefined;
    const maxMaf = mafValues.length > 0 ? Math.max(...mafValues) : undefined;

    // Check: Throttle increases but rpm does not
    if ((maxThrottle - minThrottle) > 10 && (maxRpm - minRpm) < 300) {
      status = 'warning';
      details.push('Throttle input not reflected in RPM.');
    }

    // Check: rpm increases but engineLoad stays low
    if ((maxRpm - minRpm) > 500 && maxLoad < 20) {
      status = 'warning';
      details.push('Possible airflow restriction (engine load stayed low).');
    }

    // Check: maf does not increase with rpm
    if (minMaf !== undefined && maxMaf !== undefined) {
      if ((maxRpm - minRpm) > 500 && (maxMaf - minMaf) < 3) {
        status = 'warning';
        details.push('Airflow not matching RPM (MAF response is sluggish).');
      }
    }

    // Check: STFT/LTFT spike > ±12 under load
    let fuelSpike = false;
    for (const f of frames) {
      if (Math.abs(f.stftB1) > 12 || Math.abs(f.ltftB1) > 12) {
        fuelSpike = true;
        break;
      }
    }

    if (fuelSpike) {
      status = 'warning';
      details.push('Fueling unstable under load (trims spiked > ±12%).');
    }

    let summary = 'Engine responds normally under load.';
    if (status === 'warning') {
      summary = 'Abnormal engine response detected during rev.';
    }

    return {
      status,
      summary,
      details: details.length > 0 ? details : undefined,
      confidence: 0.85
    };
  }
};
