import { Injectable } from '@angular/core';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { DriveSignature } from './diagnosis-intelligence.models';

@Injectable({ providedIn: 'root' })
export class DriveSignatureService {

  extract(idleFrames: ObdLiveFrame[], revFrames: ObdLiveFrame[]): DriveSignature {
    return {
      idleStability: this.extractIdleStability(idleFrames),
      revResponse:   this.extractRevResponse(revFrames),
      holdStability: this.extractHoldStability(revFrames),
      decelPattern:  this.extractDecelPattern(revFrames),
    };
  }

  private extractIdleStability(frames: ObdLiveFrame[]): DriveSignature['idleStability'] {
    // Gate on RPM + speed only — throttlePosition varies widely across adapters at idle
    const idle = frames.filter(f => f.speed === 0 && f.rpm <= 1200);
    if (!idle.length) return { stdDev: 0, meanRpm: 0 };
    const rpms = idle.map(f => f.rpm);
    return { stdDev: this.stddev(rpms), meanRpm: this.avg(rpms) };
  }

  private extractRevResponse(frames: ObdLiveFrame[]): DriveSignature['revResponse'] {
    if (frames.length < 5) return { riseTimeMs: 0, overshoot: 0 };
    const startIdx = frames.findIndex(f => f.rpm > 1000);
    const peakIdx  = frames.findIndex(f => f.rpm > 2000);
    const riseTimeMs = startIdx >= 0 && peakIdx > startIdx
      ? frames[peakIdx].timestamp - frames[startIdx].timestamp
      : 0;
    const maxRpm = Math.max(...frames.map(f => f.rpm));
    return { riseTimeMs, overshoot: Math.max(0, maxRpm - 2500) };
  }

  private extractHoldStability(frames: ObdLiveFrame[]): DriveSignature['holdStability'] {
    const hold = frames.filter(f => f.rpm >= 2000 && f.rpm <= 3500);
    if (!hold.length) return { stdDev: 0, meanRpm: 0 };
    const rpms = hold.map(f => f.rpm);
    return { stdDev: this.stddev(rpms), meanRpm: this.avg(rpms) };
  }

  private extractDecelPattern(frames: ObdLiveFrame[]): DriveSignature['decelPattern'] {
    if (frames.length < 5) return { dropRatePerSec: 0 };
    const peakIdx   = frames.reduce((mi, f, i, arr) => f.rpm > arr[mi].rpm ? i : mi, 0);
    const postPeak  = frames.slice(peakIdx);
    if (postPeak.length < 2) return { dropRatePerSec: 0 };
    const durationSec = (postPeak[postPeak.length - 1].timestamp - postPeak[0].timestamp) / 1000;
    if (durationSec <= 0) return { dropRatePerSec: 0 };
    return { dropRatePerSec: (postPeak[0].rpm - postPeak[postPeak.length - 1].rpm) / durationSec };
  }

  private avg(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  private stddev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = this.avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length);
  }
}
