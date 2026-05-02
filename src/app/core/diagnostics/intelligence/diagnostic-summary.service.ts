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

    const keyIssues = this.buildKeyIssues(findings, severity);

    return {
      summaryText: `${intro}${detail} Severity score: ${severity.score}/100.`,
      recommendedAction: LEVEL_ACTION[severity.level],
      keyIssues,
    };
  }

  private buildKeyIssues(findings: CorrelationFinding[], severity: DiagnosisSeverity): string[] {
    const issues: string[] = [];

    // Severity-level headline
    if (severity.score === 0) {
      issues.push('No faults detected — vehicle is operating normally');
      return issues;
    }

    // Confirmed (severity-upgrading) findings take top priority
    for (const f of findings.filter(f => f.upgradesSeverity)) {
      issues.push(this.firstSentence(f.message));
    }

    // Add remaining findings that weren't already included
    for (const f of findings.filter(f => !f.upgradesSeverity)) {
      const sentence = this.firstSentence(f.message);
      if (!issues.includes(sentence)) issues.push(sentence);
    }

    // Cap at 5 to keep the summary scannable
    return issues.slice(0, 5);
  }

  private firstSentence(text: string): string {
    const end = text.search(/[.!?]/);
    return end >= 0 ? text.slice(0, end + 1) : text;
  }
}
