import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { CorrelationFinding, DiagnosisSeverity } from './diagnosis-intelligence.models';

const DTC_SEVERITY_POINTS: Record<string, number> = {
  Critical: 30,
  High:     20,
  Medium:   10,
  Low:       5,
  Unknown:   8,
};

@Injectable({ providedIn: 'root' })
export class SeverityEngineService {

  score(
    dtcCodes: DtcCode[],
    findings: CorrelationFinding[],
    latestFrame?: ObdLiveFrame
  ): DiagnosisSeverity {
    let points = 0;

    for (const dtc of dtcCodes) {
      points += DTC_SEVERITY_POINTS[dtc.severity ?? 'Unknown'] ?? 8;
    }

    for (const finding of findings) {
      points += finding.upgradesSeverity ? 15 : 5;
    }

    if (latestFrame) {
      if (Math.abs(latestFrame.stftB1) > 25) points += 10;
      if (Math.abs(latestFrame.ltftB1) > 15) points += 8;
    }

    const score = Math.min(points, 100);
    return { score, level: this.toLevel(score) };
  }

  private toLevel(score: number): DiagnosisSeverity['level'] {
    if (score >= 75) return 'Critical';
    if (score >= 50) return 'High';
    if (score >= 25) return 'Medium';
    return 'Low';
  }
}
