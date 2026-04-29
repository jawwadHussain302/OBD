import { Injectable } from '@angular/core';
import { CorrelationFinding, DiagnosisSeverity, DiagnosisSummary } from './diagnosis-intelligence.models';

const LEVEL_INTRO: Record<DiagnosisSeverity['level'], string> = {
  Low:      'Vehicle is in acceptable condition with minor issues noted.',
  Medium:   'Vehicle shows moderate issues that should be addressed.',
  High:     'Vehicle has significant faults requiring prompt attention.',
  Critical: 'Vehicle has critical faults — immediate inspection required.',
};

const LEVEL_ACTION: Record<DiagnosisSeverity['level'], string> = {
  Low:      'Monitor and address at next scheduled service.',
  Medium:   'Schedule a service appointment within 1–2 weeks.',
  High:     'Have the vehicle inspected by a technician soon.',
  Critical: 'Do not drive until the vehicle has been professionally inspected.',
};

@Injectable({ providedIn: 'root' })
export class DiagnosticSummaryService {

  generate(findings: CorrelationFinding[], severity: DiagnosisSeverity): DiagnosisSummary {
    const intro = LEVEL_INTRO[severity.level];

    const upgrades = findings.filter(f => f.upgradesSeverity);
    let detail = '';
    if (upgrades.length === 1) {
      detail = ` ${this.firstSentence(upgrades[0].message)}`;
    } else if (upgrades.length > 1) {
      const conditions = upgrades.map(f => f.codes.join('/'));
      detail = ` Multiple confirmed issues: ${conditions.join(', ')}.`;
    } else if (findings.length > 0) {
      detail = ` ${this.firstSentence(findings[0].message)}`;
    }

    return {
      summaryText: `${intro}${detail} Severity score: ${severity.score}/100.`,
      recommendedAction: LEVEL_ACTION[severity.level],
    };
  }

  private firstSentence(text: string): string {
    const end = text.search(/[.!?]/);
    return end >= 0 ? text.slice(0, end + 1) : text;
  }
}
