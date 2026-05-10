import { Injectable } from '@angular/core';
import { DtcCode } from './dtc/dtc-code.model';

// ── Public types ──────────────────────────────────────────────────────────────

export type CylinderStatus     = 'normal' | 'suspect' | 'critical';
export type AnalysisConfidence = 'low' | 'medium' | 'high';

export interface CylinderAnalysisResult {
  /** True when at least one misfire-related DTC was present. */
  hasData: boolean;
  /** The cylinder most likely to be at fault, or null for random/unknown. */
  primaryCylinder: number | null;
  /** All cylinders with evidence, ranked highest → lowest confidence. */
  affectedCylinders: number[];
  status: CylinderStatus;
  /** Human-readable evidence strings shown to the mechanic. */
  evidence: string[];
  /** Hypothesis IDs from the misfire pack, ordered most → least likely. */
  likelyCauses: string[];
  /** Key of the first guided test to run next. */
  recommendedNextTest: string;
  confidence: AnalysisConfidence;
}

// ── Misfire DTC range ─────────────────────────────────────────────────────────

// P0300 = random/multiple misfire
// P0301–P0308 = cylinder-specific misfire (covers 4-, 6-, and 8-cylinder engines)
const MISFIRE_PATTERN = /^P030[0-8]$/;
const CYLINDER_PATTERN = /^P030([1-8])$/;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CylinderAnalysisService {

  /**
   * Analyse available DTC evidence and identify the most likely affected cylinder.
   *
   * @param dtcCodes   Active or stored DTCs from the current session.
   * @param misfireCounters  Optional per-cylinder misfire counts from Mode 06 /
   *                         manufacturer-specific PIDs. Keyed by cylinder number.
   *
   * Example — P0302 only:
   *   analyse([{ code: 'P0302', ... }])
   *   → { primaryCylinder: 2, status: 'suspect', confidence: 'high',
   *       recommendedNextTest: 'ignition_coil_swap', ... }
   *
   * Example — P0300 only:
   *   analyse([{ code: 'P0300', ... }])
   *   → { primaryCylinder: null, status: 'suspect', confidence: 'medium',
   *       recommendedNextTest: 'fuel_pressure_test', ... }
   */
  analyse(
    dtcCodes: DtcCode[],
    misfireCounters?: Record<number, number>,
  ): CylinderAnalysisResult {
    const misfireDtcs = dtcCodes.filter(d => MISFIRE_PATTERN.test(d.code));

    if (!misfireDtcs.length) {
      return this.noDataResult();
    }

    const hasRandomMisfire = misfireDtcs.some(d => d.code === 'P0300');
    const specificCylinders = this.parseSpecificCylinders(misfireDtcs);
    const rankedCylinders   = this.rankCylinders(specificCylinders, misfireCounters);
    const primaryCylinder   = rankedCylinders[0] ?? null;

    const evidence          = this.buildEvidence(misfireDtcs, misfireCounters);
    const status            = this.deriveStatus(misfireDtcs, misfireCounters);
    const confidence        = this.deriveConfidence(specificCylinders, hasRandomMisfire);
    const likelyCauses      = this.deriveLikelyCauses(primaryCylinder, hasRandomMisfire);
    const recommendedNextTest = this.deriveRecommendedTest(primaryCylinder, hasRandomMisfire);

    return {
      hasData: true,
      primaryCylinder,
      affectedCylinders: rankedCylinders,
      status,
      evidence,
      likelyCauses,
      recommendedNextTest,
      confidence,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private noDataResult(): CylinderAnalysisResult {
    return {
      hasData: false,
      primaryCylinder: null,
      affectedCylinders: [],
      status: 'normal',
      evidence: [],
      likelyCauses: [],
      recommendedNextTest: '',
      confidence: 'low',
    };
  }

  private parseSpecificCylinders(codes: DtcCode[]): number[] {
    const cylinders = new Set<number>();
    for (const dtc of codes) {
      const m = dtc.code.match(CYLINDER_PATTERN);
      if (m) cylinders.add(parseInt(m[1], 10));
    }
    return [...cylinders].sort((a, b) => a - b);
  }

  private rankCylinders(
    cylinders: number[],
    counters?: Record<number, number>,
  ): number[] {
    if (!counters) return cylinders;
    return [...cylinders].sort((a, b) => (counters[b] ?? 0) - (counters[a] ?? 0));
  }

  private buildEvidence(
    codes: DtcCode[],
    counters?: Record<number, number>,
  ): string[] {
    return codes.map(dtc => {
      if (dtc.code === 'P0300') {
        return 'P0300 — Random or multiple-cylinder misfire detected';
      }
      const m = dtc.code.match(CYLINDER_PATTERN);
      if (!m) return `${dtc.code} — Misfire detected`;
      const cyl = parseInt(m[1], 10);
      const count = counters?.[cyl];
      return count != null
        ? `${dtc.code} — Cylinder ${cyl} misfire (${count} counts)`
        : `${dtc.code} — Cylinder ${cyl} misfire detected`;
    });
  }

  private deriveStatus(
    codes: DtcCode[],
    counters?: Record<number, number>,
  ): CylinderStatus {
    // Multiple specific cylinders = more severe
    const specificCount = codes.filter(d => CYLINDER_PATTERN.test(d.code)).length;
    if (specificCount >= 3) return 'critical';

    // High misfire counter threshold
    if (counters) {
      const max = Math.max(...Object.values(counters));
      if (max > 50) return 'critical';
    }

    return 'suspect';
  }

  private deriveConfidence(
    specificCylinders: number[],
    hasRandomMisfire: boolean,
  ): AnalysisConfidence {
    if (specificCylinders.length > 0) return 'high';
    if (hasRandomMisfire)             return 'medium';
    return 'low';
  }

  private deriveLikelyCauses(
    primaryCylinder: number | null,
    hasRandomMisfire: boolean,
  ): string[] {
    if (primaryCylinder !== null) {
      // Single cylinder — hardware inside that cylinder is most likely
      return [
        'ignition_coil_issue',
        'spark_plug_issue',
        'injector_issue',
        'compression_issue',
        'wiring_or_ecu_issue',
        'intake_leak_issue',
      ];
    }
    if (hasRandomMisfire) {
      // Random misfire — systemic / fuel delivery causes move to the front
      return [
        'intake_leak_issue',
        'injector_issue',
        'ignition_coil_issue',
        'spark_plug_issue',
        'compression_issue',
        'wiring_or_ecu_issue',
      ];
    }
    return [];
  }

  private deriveRecommendedTest(
    primaryCylinder: number | null,
    hasRandomMisfire: boolean,
  ): string {
    if (primaryCylinder !== null) {
      // Coil swap is the cheapest, fastest, most decisive single-cylinder test
      return 'ignition_coil_swap';
    }
    if (hasRandomMisfire) {
      // Random misfire — check fuel delivery and intake before component swaps
      return 'fuel_pressure_test';
    }
    return '';
  }
}
