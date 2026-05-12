import { Injectable } from '@angular/core';
import type { DtcCode } from './dtc/dtc-code.model';

// ── Public types ──────────────────────────────────────────────────────────────

export type CatalyticConverterStatus =
  | 'normal'
  | 'mildly_degraded'
  | 'severely_degraded'
  | 'likely_missing'
  | 'possibly_restricted';

export type CatalyticConfidence = 'low' | 'medium' | 'high';

export interface O2SensorData {
  /** Pre-catalyst switching frequency in Hz. Normal closed-loop: 0.5–2 Hz. */
  switchingHz?: number;
  /** Minimum measured voltage in volts. */
  minVoltage?: number;
  /** Maximum measured voltage in volts. */
  maxVoltage?: number;
}

export interface CatalyticConverterInput {
  dtcCodes: DtcCode[];

  o2Sensors?: {
    /** Upstream (pre-cat) O2 sensor readings. */
    upstream?: O2SensorData;
    /** Downstream (post-cat) O2 sensor readings. */
    downstream?: O2SensorData;
    /**
     * Normalised cross-correlation between upstream and downstream signals.
     * 0 = no relationship; 1 = perfect mirror. Values above 0.75 indicate
     * the catalyst is not oxidising/reducing between the two sensors.
     */
    crossCorrelation?: number;
    /**
     * True when the downstream sensor voltage has been stable for several
     * minutes (typical of a healthy working catalyst holding ~0.6–0.8 V).
     */
    downstreamIsStable?: boolean;
  };

  symptoms?: {
    /** Rattle, louder exhaust note, or physical damage reported. */
    exhaustLoudnessIncreased?: boolean;
    /** Noticeable hesitation or reduced acceleration under load. */
    powerLossUnderLoad?: boolean;
    /** Short-term or long-term fuel trim outside ±10 %. */
    fuelTrimAbnormal?: boolean;
  };
}

export interface CatalyticConverterIndicators {
  p0420Detected: boolean;
  p0430Detected: boolean;
  /** Downstream closely tracks upstream movement (crossCorrelation > 0.75). */
  downstreamMirrorsUpstream: boolean;
  /** Downstream O2 sensor is stable — catalyst is working. */
  downstreamStable: boolean;
  /** OBD-II catalyst efficiency monitor has set a code. */
  catalystMonitorReady: boolean;
  /** Backpressure / restriction symptoms present. */
  restrictionSuspected: boolean;
}

export interface CatalyticConverterResult {
  status: CatalyticConverterStatus;
  confidence: CatalyticConfidence;
  evidence: string[];
  explanation: string;
  recommendations: string[];
  indicators: CatalyticConverterIndicators;
}

// ── Internal thresholds ───────────────────────────────────────────────────────

/** Above this cross-correlation value the downstream sensor mirrors upstream. */
const MIRROR_THRESHOLD = 0.75;
/** Above this cross-correlation value degradation is moderate (not severe). */
const MILD_THRESHOLD = 0.40;
/** Downstream switching above this Hz suggests the cat is not dampening. */
const DOWNSTREAM_ACTIVE_HZ = 0.20;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CatalyticConverterAnalysisService {

  /**
   * Analyse catalytic converter health from available evidence.
   *
   * The method does NOT require DTCs — it produces a result from live O2
   * sensor behaviour alone when sensor data is supplied. P0420 / P0430 raise
   * confidence but their absence never blocks the analysis.
   *
   * @param input  DTCs, optional O2 sensor readings, and optional symptoms.
   *
   * Example — P0420 only:
   *   analyse({ dtcCodes: [{ code: 'P0420', ... }] })
   *   → { status: 'severely_degraded', confidence: 'high', ... }
   *
   * Example — no DTCs, downstream mirrors upstream (correlation 0.85):
   *   analyse({ dtcCodes: [], o2Sensors: { crossCorrelation: 0.85 } })
   *   → { status: 'severely_degraded', confidence: 'medium', ... }
   *
   * Example — all sensors normal, downstream stable:
   *   analyse({ dtcCodes: [], o2Sensors: { downstreamIsStable: true,
   *             crossCorrelation: 0.20 } })
   *   → { status: 'normal', confidence: 'high', ... }
   */
  analyse(input: CatalyticConverterInput): CatalyticConverterResult {
    const { dtcCodes = [], o2Sensors, symptoms } = input;

    // ── DTC flags ─────────────────────────────────────────────────────────────
    const p0420 = dtcCodes.some(d => d.code === 'P0420');
    const p0430 = dtcCodes.some(d => d.code === 'P0430');
    const hasEfficiencyCode = p0420 || p0430;

    // ── O2 sensor derived flags ───────────────────────────────────────────────
    const correlation = o2Sensors?.crossCorrelation;
    const downstreamHz = o2Sensors?.downstream?.switchingHz;

    const downstreamMirrors =
      correlation !== undefined
        ? correlation > MIRROR_THRESHOLD
        : false;

    const downstreamActive =
      downstreamHz !== undefined
        ? downstreamHz > DOWNSTREAM_ACTIVE_HZ
        : false;

    const mildDegradation =
      correlation !== undefined
        ? correlation > MILD_THRESHOLD && correlation <= MIRROR_THRESHOLD
        : downstreamActive;

    const downstreamStable =
      o2Sensors?.downstreamIsStable === true ||
      (downstreamHz !== undefined && downstreamHz <= DOWNSTREAM_ACTIVE_HZ &&
       correlation !== undefined && correlation < MILD_THRESHOLD);

    // ── Symptom flags ─────────────────────────────────────────────────────────
    const exhaustLoud      = symptoms?.exhaustLoudnessIncreased === true;
    const powerLoss        = symptoms?.powerLossUnderLoad       === true;
    const fuelTrimAbnormal = symptoms?.fuelTrimAbnormal         === true;

    const restrictionSuspected = powerLoss && !hasEfficiencyCode && !downstreamMirrors;

    // ── Evidence collection ───────────────────────────────────────────────────
    const evidence: string[] = [];

    if (p0420) evidence.push('P0420 — Catalyst system efficiency below threshold (Bank 1)');
    if (p0430) evidence.push('P0430 — Catalyst system efficiency below threshold (Bank 2)');

    if (correlation !== undefined) {
      evidence.push(
        `Downstream-to-upstream O2 correlation: ${(correlation * 100).toFixed(0)} %` +
        (downstreamMirrors ? ' — downstream mirrors upstream (cat not converting)' :
         mildDegradation   ? ' — downstream more active than expected' :
                             ' — downstream independent of upstream (catalyst working)'),
      );
    }

    if (downstreamHz !== undefined) {
      evidence.push(
        `Downstream O2 switching rate: ${downstreamHz.toFixed(2)} Hz` +
        (downstreamActive ? ' — too active for a healthy catalyst' : ' — within normal range'),
      );
    }

    if (o2Sensors?.downstreamIsStable) {
      evidence.push('Downstream O2 sensor stable at expected voltage — catalyst reducing/oxidising correctly');
    }

    if (o2Sensors?.upstream?.switchingHz !== undefined) {
      const hz = o2Sensors.upstream.switchingHz;
      evidence.push(`Upstream O2 switching at ${hz.toFixed(2)} Hz — closed-loop fuel control active`);
    }

    if (exhaustLoud)      evidence.push('Increased exhaust noise or rattle reported — possible substrate damage or missing catalyst');
    if (powerLoss)        evidence.push('Power loss under load reported — possible exhaust restriction / backpressure');
    if (fuelTrimAbnormal) evidence.push('Fuel trim deviation detected — downstream O2 feedback may be affecting closed-loop control');

    // ── Status determination ──────────────────────────────────────────────────
    let status: CatalyticConverterStatus;
    let confidence: CatalyticConfidence;

    if (downstreamMirrors || (hasEfficiencyCode && exhaustLoud)) {
      // Downstream perfectly tracks upstream — cat not functioning — or code + loud exhaust
      status = exhaustLoud ? 'likely_missing' : 'severely_degraded';
      confidence = hasEfficiencyCode && downstreamMirrors ? 'high'
                 : hasEfficiencyCode || downstreamMirrors  ? 'high'
                 : 'medium';
    } else if (hasEfficiencyCode) {
      // Code present without mirror or loud exhaust
      status = 'severely_degraded';
      confidence = 'high';
    } else if (mildDegradation) {
      status = 'mildly_degraded';
      confidence = correlation !== undefined ? 'medium' : 'low';
    } else if (restrictionSuspected) {
      status = 'possibly_restricted';
      confidence = 'low';
    } else if (downstreamStable || (!hasEfficiencyCode && evidence.length > 0)) {
      status = 'normal';
      confidence = downstreamStable ? 'high' : 'medium';
    } else {
      // No data at all
      status = 'normal';
      confidence = 'low';
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    const recommendations = this.buildRecommendations(
      status, hasEfficiencyCode, exhaustLoud, powerLoss, fuelTrimAbnormal,
    );

    // ── Explanation ───────────────────────────────────────────────────────────
    const explanation = this.buildExplanation(status, confidence, hasEfficiencyCode, correlation);

    return {
      status,
      confidence,
      evidence,
      explanation,
      recommendations,
      indicators: {
        p0420Detected: p0420,
        p0430Detected: p0430,
        downstreamMirrorsUpstream: downstreamMirrors,
        downstreamStable,
        catalystMonitorReady: hasEfficiencyCode,
        restrictionSuspected,
      },
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildRecommendations(
    status: CatalyticConverterStatus,
    hasCode: boolean,
    exhaustLoud: boolean,
    powerLoss: boolean,
    fuelTrimAbnormal: boolean,
  ): string[] {
    const recs: string[] = [];

    switch (status) {
      case 'likely_missing':
        recs.push('Perform a visual inspection — check if the catalytic converter substrate is physically present');
        recs.push('Inspect the exhaust system for signs of removal or bypass pipe installation');
        recs.push('Replace the catalytic converter; using an aftermarket bypass is illegal in most jurisdictions');
        break;

      case 'severely_degraded':
        recs.push('Verify there are no upstream issues (misfires, rich running) that may have poisoned the catalyst');
        recs.push('Check for oil or coolant consumption — burning fluids coat and kill the catalyst substrate');
        recs.push('Replace the catalytic converter once upstream root causes are confirmed resolved');
        if (hasCode) recs.push('Clear P0420/P0430 after repair; the monitor will run again on the next drive cycle');
        break;

      case 'mildly_degraded':
        recs.push('Monitor closely — schedule a full catalyst efficiency test within the next service interval');
        recs.push('Check for misfires or minor fuel trim issues that could accelerate catalyst wear');
        recs.push('Confirm downstream O2 sensor is functioning correctly before condemning the catalyst');
        break;

      case 'possibly_restricted':
        recs.push('Perform a differential backpressure test: measure exhaust pressure before and after the catalyst');
        recs.push('A pressure drop above 1.5 psi at idle suggests internal restriction or collapsed substrate');
        recs.push('Inspect the converter externally for impact damage or heat discolouration');
        break;

      case 'normal':
        recs.push('No catalytic converter issues detected');
        recs.push('Continue scheduled maintenance; re-evaluate if efficiency codes appear in the future');
        break;
    }

    if (fuelTrimAbnormal && status !== 'normal') {
      recs.push('Correct abnormal fuel trims before replacing the catalyst — running rich will damage a new unit');
    }

    if (exhaustLoud && status !== 'likely_missing') {
      recs.push('Inspect the catalyst heat shield and mounting hardware for rattling caused by loose substrate');
    }

    return recs;
  }

  private buildExplanation(
    status: CatalyticConverterStatus,
    confidence: CatalyticConfidence,
    hasCode: boolean,
    correlation: number | undefined,
  ): string {
    const confidenceNote = confidence === 'low'
      ? ' Note: confidence is low — more sensor data is needed for a definitive result.'
      : '';

    switch (status) {
      case 'likely_missing':
        return `Evidence strongly suggests the catalytic converter substrate may be physically absent or completely destroyed. The downstream O2 sensor is behaving identically to the upstream sensor, and increased exhaust noise has been reported.${confidenceNote}`;

      case 'severely_degraded':
        return hasCode
          ? `The OBD-II catalyst efficiency monitor has confirmed that conversion efficiency is below the minimum threshold${correlation !== undefined ? ` and the downstream O2 sensor is closely tracking the upstream signal (${(correlation * 100).toFixed(0)} % correlation)` : ''}. The catalyst requires replacement.${confidenceNote}`
          : `Downstream O2 sensor behaviour indicates the catalyst is no longer converting exhaust gases effectively. Although no efficiency code is stored, the sensor pattern is consistent with a failed substrate.${confidenceNote}`;

      case 'mildly_degraded':
        return `The catalytic converter shows early signs of degradation. The downstream O2 sensor is more active than expected for a healthy catalyst, suggesting partial loss of conversion capacity. Immediate replacement is not required but continued monitoring is advised.${confidenceNote}`;

      case 'possibly_restricted':
        return `Power loss under load with no efficiency code or mirroring pattern suggests the catalyst substrate may be partially blocked or collapsed, creating backpressure. A physical backpressure test is recommended to confirm.${confidenceNote}`;

      case 'normal':
        return `Available sensor data indicates the catalytic converter is functioning within normal parameters. The downstream O2 sensor is stable and independent of upstream switching, consistent with effective exhaust gas conversion.${confidenceNote}`;
    }
  }
}
