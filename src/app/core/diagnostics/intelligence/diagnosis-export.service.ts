import { Injectable } from '@angular/core';
import { DeepDiagnosisState } from '../deep-diagnosis.service';

@Injectable({ providedIn: 'root' })
export class DiagnosisExportService {

  exportJson(state: DeepDiagnosisState): void {
    const data = {
      exportedAt: new Date().toISOString(),
      severity: state.severity ?? null,
      dtcCodes: state.dtcCodes ?? [],
      correlationFindings: state.correlationFindings ?? [],
      recommendations: state.recommendations ?? null,
      summary: state.diagnosisSummary ?? null,
      timeline: state.timelineEvents ?? [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    this.triggerDownload(blob, `diagnosis-${this.timestamp()}.json`);
  }

  exportCsv(state: DeepDiagnosisState): void {
    const lines: string[] = ['Section,Field,Value'];

    if (state.severity) {
      lines.push(`Severity,Score,${state.severity.score}`);
      lines.push(`Severity,Level,${state.severity.level}`);
    }

    if (state.diagnosisSummary) {
      lines.push(`Summary,Text,${this.escape(state.diagnosisSummary.summaryText)}`);
      lines.push(`Summary,Recommended Action,${this.escape(state.diagnosisSummary.recommendedAction)}`);
    }

    for (const dtc of state.dtcCodes ?? []) {
      lines.push(`DTC,${dtc.code},${this.escape(dtc.title + ' - ' + dtc.description)}`);
    }

    for (const finding of state.correlationFindings ?? []) {
      lines.push(`Finding,${finding.codes.join('/')},${this.escape(finding.message)}`);
    }

    for (const check of state.recommendations?.recommendedChecks ?? []) {
      lines.push(`Recommended Check,,${this.escape(check)}`);
    }

    for (const step of state.recommendations?.nextSteps ?? []) {
      lines.push(`Next Step,,${this.escape(step)}`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    this.triggerDownload(blob, `diagnosis-${this.timestamp()}.csv`);
  }

  private escape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }
}
