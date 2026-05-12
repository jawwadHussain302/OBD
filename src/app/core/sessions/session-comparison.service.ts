import { Injectable } from '@angular/core';
import type { HistoryEntry } from '../diagnostics/diagnosis-history.service';
import type { DtcCode } from '../diagnostics/dtc/dtc-code.model';
import type { DiagnosisSeverity } from '../diagnostics/intelligence/diagnosis-intelligence.models';
import {
  RepairEffectiveness,
  SessionComparisonOutcome,
  SessionComparisonResult,
} from './session-comparison.models';

// Severity ordering used for trend comparison.
const SEVERITY_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };

@Injectable({ providedIn: 'root' })
export class SessionComparisonService {

  /**
   * Compare two history entries and return a structured result.
   *
   * `earlier` and `later` must be the chronologically-ordered sessions; the
   * caller is responsible for ordering by `savedAt` before calling this method.
   *
   * Validation rules:
   *   - The two sessions must not be the same entry (same id).
   *   - If both sessions carry a non-empty VIN they must match.
   *   - When no VIN is available on either side, vehicleName is used as the
   *     cross-vehicle guard (VehicleProfile.vin is optional and is not
   *     propagated into DeepDiagnosisState, so VIN-based matching only works
   *     when the user has explicitly entered a VIN on the vehicle profile).
   *
   * Example:
   *   const [a, b] = entries.sort((x, y) => x.savedAt - y.savedAt);
   *   const outcome = service.compare(a, b);
   *   if (outcome.ok) console.log(outcome.result.overallConclusion);
   */
  compare(earlier: HistoryEntry, later: HistoryEntry): SessionComparisonOutcome {
    // ── Validation ────────────────────────────────────────────────────────────
    if (earlier.id === later.id) {
      return {
        ok: false,
        error: { reason: 'same_session', message: 'Both sessions are identical.' },
      };
    }

    const vinA = this.extractVin(earlier);
    const vinB = this.extractVin(later);
    if (vinA && vinB && vinA !== vinB) {
      return {
        ok: false,
        error: {
          reason: 'vin_mismatch',
          message: `Sessions belong to different vehicles (${vinA} vs ${vinB}).`,
        },
      };
    }

    // Fallback: when neither entry has a stored VIN, use vehicleName as the
    // vehicle identity guard so sessions from different cars are still rejected.
    if (!vinA && !vinB && earlier.vehicleName !== later.vehicleName) {
      return {
        ok: false,
        error: {
          reason: 'vin_mismatch',
          message: `Sessions appear to be from different vehicles ("${earlier.vehicleName}" vs "${later.vehicleName}").`,
        },
      };
    }

    // ── DTC comparison ────────────────────────────────────────────────────────
    const codesA = this.dtcCodes(earlier);
    const codesB = this.dtcCodes(later);

    const setA = new Set(codesA.map(d => d.code));
    const setB = new Set(codesB.map(d => d.code));

    const fixedIssues:   string[] = [];
    const stillPresent:  string[] = [];
    const newIssues:     string[] = [];

    for (const dtc of codesA) {
      if (setB.has(dtc.code)) {
        stillPresent.push(this.formatDtc(dtc));
      } else {
        fixedIssues.push(this.formatDtc(dtc));
      }
    }
    for (const dtc of codesB) {
      if (!setA.has(dtc.code)) {
        newIssues.push(this.formatDtc(dtc));
      }
    }

    // ── Metric comparison ─────────────────────────────────────────────────────
    const improvedMetrics:   string[] = [];
    const worsenedMetrics:   string[] = [];
    const unchangedFindings: string[] = [];

    this.compareSeverity(earlier.severity, later.severity, improvedMetrics, worsenedMetrics, unchangedFindings);
    this.comparePrimaryIssue(earlier, later, unchangedFindings);
    this.compareRecommendations(earlier, later, unchangedFindings);

    // ── Repair effectiveness ──────────────────────────────────────────────────
    const repairEffectiveness = this.calcEffectiveness(
      fixedIssues, stillPresent, newIssues,
      improvedMetrics, worsenedMetrics,
    );

    // ── Overall conclusion ────────────────────────────────────────────────────
    const overallConclusion = this.buildConclusion(
      fixedIssues, stillPresent, newIssues,
      improvedMetrics, worsenedMetrics,
      repairEffectiveness,
    );

    return {
      ok: true,
      result: {
        fixedIssues,
        stillPresent,
        newIssues,
        improvedMetrics,
        worsenedMetrics,
        unchangedFindings,
        overallConclusion,
        repairEffectiveness,
      },
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private extractVin(entry: HistoryEntry): string | null {
    // VehicleProfile.vin is optional; when set it is stored on the profile
    // object inside state. DeepDiagnosisState itself has no top-level vin field.
    const state = entry.state as unknown as Record<string, unknown>;
    const profile = state['vehicleProfile'] as Record<string, unknown> | undefined;
    const vin = profile?.['vin'] ?? state['vin'];
    return typeof vin === 'string' && vin.trim().length >= 5 ? vin.trim().toUpperCase() : null;
  }

  private dtcCodes(entry: HistoryEntry): DtcCode[] {
    return entry.state.dtcCodes ?? [];
  }

  private formatDtc(dtc: DtcCode): string {
    return dtc.title ? `${dtc.code} — ${dtc.title}` : dtc.code;
  }

  private compareSeverity(
    a: DiagnosisSeverity | null | undefined,
    b: DiagnosisSeverity | null | undefined,
    improved: string[],
    worsened: string[],
    unchanged: string[],
  ): void {
    if (!a || !b) return;

    const rankA = SEVERITY_RANK[a.level] ?? 0;
    const rankB = SEVERITY_RANK[b.level] ?? 0;

    if (rankB < rankA) {
      improved.push(`Overall severity improved: ${a.level} → ${b.level}`);
    } else if (rankB > rankA) {
      worsened.push(`Overall severity worsened: ${a.level} → ${b.level}`);
    } else if (b.score < a.score - 0.05) {
      improved.push(`Severity score reduced: ${a.score.toFixed(0)} → ${b.score.toFixed(0)}`);
    } else if (b.score > a.score + 0.05) {
      worsened.push(`Severity score increased: ${a.score.toFixed(0)} → ${b.score.toFixed(0)}`);
    } else {
      unchanged.push(`Severity unchanged: ${b.level}`);
    }
  }

  private comparePrimaryIssue(
    earlier: HistoryEntry,
    later: HistoryEntry,
    unchanged: string[],
  ): void {
    const issueA = earlier.primaryIssue;
    const issueB = later.primaryIssue;

    if (!issueA && !issueB) return;
    if (issueA && issueB && issueA === issueB) {
      unchanged.push(`Primary issue unchanged: ${issueA}`);
    }
  }

  private compareRecommendations(
    earlier: HistoryEntry,
    later: HistoryEntry,
    unchanged: string[],
  ): void {
    const stepsA = new Set(earlier.state.recommendations?.nextSteps ?? []);
    const stepsB = later.state.recommendations?.nextSteps ?? [];

    const persistedSteps = stepsB.filter(s => stepsA.has(s));
    for (const step of persistedSteps) {
      unchanged.push(`Recommendation still applies: ${step}`);
    }
  }

  private calcEffectiveness(
    fixed: string[],
    still: string[],
    newIssues: string[],
    improved: string[],
    worsened: string[],
  ): RepairEffectiveness {
    const hasFixed    = fixed.length > 0;
    const hasNew      = newIssues.length > 0;
    const hasStill    = still.length > 0;
    const hasImproved = improved.length > 0;
    const hasWorsened = worsened.length > 0;

    if (hasWorsened && !hasFixed && !hasImproved) return 'worsened';
    if (hasFixed && !hasStill && !hasNew)          return 'successful';
    if (hasFixed || hasImproved)                   return 'partial';
    if (hasNew && !hasFixed && !hasImproved)       return 'worsened';
    return 'no_change';
  }

  private buildConclusion(
    fixed: string[],
    still: string[],
    newIssues: string[],
    improved: string[],
    worsened: string[],
    effectiveness: RepairEffectiveness,
  ): string {
    const parts: string[] = [];

    if (fixed.length)      parts.push(`${fixed.length} fault${fixed.length > 1 ? 's' : ''} resolved`);
    if (still.length)      parts.push(`${still.length} fault${still.length > 1 ? 's' : ''} still present`);
    if (newIssues.length)  parts.push(`${newIssues.length} new fault${newIssues.length > 1 ? 's' : ''} detected`);
    if (improved.length)   parts.push(`overall condition improved`);
    if (worsened.length)   parts.push(`overall condition worsened`);

    const summary = parts.length ? parts.join(', ') + '.' : 'No significant changes detected between sessions.';

    const label: Record<RepairEffectiveness, string> = {
      successful: 'Repair appears fully successful.',
      partial:    'Repair was partially effective — further investigation recommended.',
      no_change:  'No meaningful change detected — repair may not have been performed or was ineffective.',
      worsened:   'Vehicle condition has worsened since the earlier session — urgent attention required.',
    };

    return `${summary} ${label[effectiveness]}`;
  }
}
