import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { CorrelationFinding, DiagnosisSeverity, RootCauseCandidate } from './diagnosis-intelligence.models';

interface RootCauseRule {
  id: string;
  title: string;
  evaluate(
    ctx: InferenceContext
  ): { matched: boolean; confidence: 'Low' | 'Medium' | 'High'; explanation: string; evidence: string[] } | null;
}

interface InferenceContext {
  codes: Set<string>;
  dtcCodes: DtcCode[];
  correlationFindings: CorrelationFinding[];
  severity: DiagnosisSeverity;
  avgIdleStft: number | null;
  avgRevStft: number | null;
  avgIdleLtft: number | null;
  idleRpmStdDev: number | null;
  avgIdleRpm: number | null;
  avgRevRpm: number | null;
  mafScalesWithRpm: boolean | null;
}

const RULES: RootCauseRule[] = [
  {
    id: 'vacuum-leak',
    title: 'Vacuum / Intake Leak',
    evaluate(ctx) {
      const hasLean = ctx.codes.has('P0171') || ctx.codes.has('P0174');
      if (!hasLean) return null;

      if (ctx.avgIdleStft !== null && ctx.avgIdleStft > 10 && ctx.avgRevStft !== null && ctx.avgRevStft < 5) {
        return {
          matched: true,
          confidence: 'High',
          explanation:
            'Lean fuel trims are elevated at idle but normalise under engine load. ' +
            'This pattern is characteristic of a vacuum or intake air leak, which adds unmetered air at low throttle but becomes proportionally smaller as load increases.',
          evidence: [
            `Idle STFT: +${ctx.avgIdleStft.toFixed(1)}% (elevated lean)`,
            `Rev STFT: +${ctx.avgRevStft.toFixed(1)}% (near normal under load)`,
            ...(ctx.codes.has('P0171') ? ['P0171: System Too Lean (Bank 1)'] : []),
            ...(ctx.codes.has('P0174') ? ['P0174: System Too Lean (Bank 2)'] : []),
          ],
        };
      }

      if (ctx.avgIdleStft !== null && ctx.avgIdleStft > 10 && ctx.avgRevStft === null) {
        return {
          matched: true,
          confidence: 'Medium',
          explanation:
            'Lean fuel trims at idle suggest a possible vacuum or intake leak, ' +
            'but rev data is unavailable to confirm the load-dependent pattern. ' +
            'Perform a smoke test on the intake system.',
          evidence: [
            `Idle STFT: +${ctx.avgIdleStft.toFixed(1)}% (elevated lean)`,
            ...(ctx.codes.has('P0171') ? ['P0171: System Too Lean (Bank 1)'] : []),
            ...(ctx.codes.has('P0174') ? ['P0174: System Too Lean (Bank 2)'] : []),
          ],
        };
      }

      return {
        matched: true,
        confidence: 'Low',
        explanation:
          'Lean DTC is present but live trim data was not captured or is within normal range. ' +
          'A vacuum leak remains possible — inspect intake hoses, PCV valve, and manifold gaskets.',
        evidence: [
          ...(ctx.codes.has('P0171') ? ['P0171: System Too Lean (Bank 1)'] : []),
          ...(ctx.codes.has('P0174') ? ['P0174: System Too Lean (Bank 2)'] : []),
        ],
      };
    },
  },

  {
    id: 'fuel-delivery',
    title: 'Fuel Delivery Fault',
    evaluate(ctx) {
      const hasLean = ctx.codes.has('P0171') || ctx.codes.has('P0174');
      if (!hasLean) return null;

      const highLtft = ctx.avgIdleLtft !== null && ctx.avgIdleLtft > 15;
      const leanAcrossRpm =
        ctx.avgIdleStft !== null &&
        ctx.avgIdleStft > 10 &&
        ctx.avgRevStft !== null &&
        ctx.avgRevStft > 5;

      if (leanAcrossRpm && highLtft) {
        return {
          matched: true,
          confidence: 'High',
          explanation:
            'Lean fuel trims are elevated across both idle and rev conditions, and long-term fuel trim is also high. ' +
            'This pattern indicates the ECU has been compensating for a persistent lean condition, consistent with a fuel delivery fault such as low fuel pressure or a weak fuel pump.',
          evidence: [
            `Idle STFT: +${ctx.avgIdleStft!.toFixed(1)}%`,
            `Rev STFT: +${ctx.avgRevStft!.toFixed(1)}%`,
            `Idle LTFT: +${ctx.avgIdleLtft!.toFixed(1)}% (persistently elevated)`,
            ...(ctx.codes.has('P0171') ? ['P0171: System Too Lean (Bank 1)'] : []),
            ...(ctx.codes.has('P0174') ? ['P0174: System Too Lean (Bank 2)'] : []),
          ],
        };
      }

      if (leanAcrossRpm) {
        return {
          matched: true,
          confidence: 'Medium',
          explanation:
            'Lean trims persist across idle and higher RPM, suggesting the lean condition is not load-dependent. ' +
            'Check fuel pressure, fuel pump output, and fuel filter condition.',
          evidence: [
            `Idle STFT: +${ctx.avgIdleStft!.toFixed(1)}%`,
            `Rev STFT: +${ctx.avgRevStft!.toFixed(1)}%`,
            ...(ctx.codes.has('P0171') ? ['P0171: System Too Lean (Bank 1)'] : []),
          ],
        };
      }

      return null;
    },
  },

  {
    id: 'leaking-injector',
    title: 'Leaking or Over-fuelling Injector',
    evaluate(ctx) {
      const hasRich = ctx.codes.has('P0172') || ctx.codes.has('P0175');
      if (!hasRich) return null;

      if (ctx.avgIdleStft !== null && ctx.avgIdleStft < -10) {
        return {
          matched: true,
          confidence: 'High',
          explanation:
            'Rich fuel trims are confirmed by live STFT data at idle. ' +
            'A leaking injector, high fuel pressure regulator, or faulty coolant temp sensor causing over-fuelling are the most likely causes.',
          evidence: [
            `Idle STFT: ${ctx.avgIdleStft.toFixed(1)}% (rich)`,
            ...(ctx.codes.has('P0172') ? ['P0172: System Too Rich (Bank 1)'] : []),
            ...(ctx.codes.has('P0175') ? ['P0175: System Too Rich (Bank 2)'] : []),
          ],
        };
      }

      return {
        matched: true,
        confidence: ctx.avgIdleStft !== null ? 'Medium' : 'Low',
        explanation:
          'Rich DTC is present but trims are within normal range during the test, suggesting an intermittent over-fuelling condition. ' +
          'Inspect fuel injectors for drips and check fuel pressure at idle.',
        evidence: [
          ...(ctx.avgIdleStft !== null ? [`Idle STFT: ${ctx.avgIdleStft.toFixed(1)}% (within range during test)`] : []),
          ...(ctx.codes.has('P0172') ? ['P0172: System Too Rich (Bank 1)'] : []),
          ...(ctx.codes.has('P0175') ? ['P0175: System Too Rich (Bank 2)'] : []),
        ],
      };
    },
  },

  {
    id: 'ignition-misfire',
    title: 'Ignition / Misfire Fault',
    evaluate(ctx) {
      const misfireCodes = [...ctx.codes].filter(c => c >= 'P0300' && c <= 'P0312');
      if (!misfireCodes.length) return null;

      if (ctx.idleRpmStdDev !== null && ctx.idleRpmStdDev > 80) {
        return {
          matched: true,
          confidence: 'High',
          explanation:
            'RPM instability at idle confirms an active misfire. ' +
            'Inspect spark plugs and ignition coils. If the misfire is cylinder-specific, swap the coil to an adjacent cylinder and retest.',
          evidence: [
            `Idle RPM standard deviation: ±${Math.round(ctx.idleRpmStdDev)} RPM (unstable)`,
            ...misfireCodes.map(c => `${c}: Misfire detected`),
          ],
        };
      }

      return {
        matched: true,
        confidence: ctx.idleRpmStdDev !== null ? 'Medium' : 'Low',
        explanation:
          'Misfire DTC is stored but RPM was stable during the test, indicating the condition may be intermittent or load-dependent. ' +
          'Inspect spark plugs, ignition coils, and perform a compression test.',
        evidence: [
          ...(ctx.idleRpmStdDev !== null
            ? [`Idle RPM standard deviation: ±${Math.round(ctx.idleRpmStdDev)} RPM (stable during test)`]
            : []),
          ...misfireCodes.map(c => `${c}: Misfire stored`),
        ],
      };
    },
  },

  {
    id: 'maf-sensor',
    title: 'MAF Sensor Fault',
    evaluate(ctx) {
      const mafCodes = [...ctx.codes].filter(c => c >= 'P0100' && c <= 'P0104');
      if (!mafCodes.length) return null;

      if (ctx.mafScalesWithRpm === false) {
        return {
          matched: true,
          confidence: 'High',
          explanation:
            'The MAF sensor reading did not increase as expected when RPM rose, indicating the sensor element is contaminated, failed, or there is an air intake restriction bypassing the sensor.',
          evidence: [
            'MAF output flat despite RPM increase',
            ...mafCodes.map(c => `${c}: MAF fault`),
          ],
        };
      }

      return {
        matched: true,
        confidence: ctx.mafScalesWithRpm !== null ? 'Medium' : 'Low',
        explanation:
          'MAF fault code is stored. Clean the MAF sensor element with dedicated MAF cleaner. ' +
          'Check for air leaks downstream of the sensor which can cause range/performance faults.',
        evidence: mafCodes.map(c => `${c}: MAF fault`),
      };
    },
  },

  {
    id: 'catalyst',
    title: 'Catalytic Converter Degradation',
    evaluate(ctx) {
      const catCodes = ['P0420', 'P0430'].filter(c => ctx.codes.has(c));
      if (!catCodes.length) return null;

      const misfireAlso = [...ctx.codes].some(c => c >= 'P0300' && c <= 'P0312');
      const richAlso    = ctx.codes.has('P0172') || ctx.codes.has('P0175');

      let explanation =
        'The catalyst efficiency monitor reports below-threshold performance. ' +
        'Compare upstream and downstream oxygen sensor waveforms to confirm.';
      const evidence: string[] = catCodes.map(c => `${c}: Catalyst efficiency below threshold`);

      if (misfireAlso) {
        explanation +=
          ' Active misfires can accelerate catalyst damage — resolve the misfire fault first.';
        evidence.push('Co-occurring misfire DTC may indicate catalyst damage from unburned fuel');
      }
      if (richAlso) {
        explanation += ' Rich running conditions also accelerate catalyst wear.';
        evidence.push('Co-occurring rich DTC');
      }

      return {
        matched: true,
        confidence: misfireAlso || richAlso ? 'High' : 'Medium',
        explanation,
        evidence,
      };
    },
  },
];

@Injectable({ providedIn: 'root' })
export class RootCauseInferenceService {

  infer(
    dtcCodes: DtcCode[],
    correlationFindings: CorrelationFinding[],
    severity: DiagnosisSeverity,
    idleFrames: ObdLiveFrame[],
    revFrames: ObdLiveFrame[],
  ): RootCauseCandidate[] {
    const ctx = this.buildContext(dtcCodes, correlationFindings, severity, idleFrames, revFrames);
    const candidates: RootCauseCandidate[] = [];

    for (const rule of RULES) {
      const result = rule.evaluate(ctx);
      if (result?.matched) {
        candidates.push({
          title: rule.id === 'vacuum-leak'      ? 'Vacuum / Intake Leak'
               : rule.id === 'fuel-delivery'    ? 'Fuel Delivery Fault'
               : rule.id === 'leaking-injector' ? 'Leaking or Over-fuelling Injector'
               : rule.id === 'ignition-misfire' ? 'Ignition / Misfire Fault'
               : rule.id === 'maf-sensor'       ? 'MAF Sensor Fault'
               : 'Catalytic Converter Degradation',
          explanation: result.explanation,
          confidence: result.confidence,
          evidence: result.evidence,
          rank: 0,
        });
      }
    }

    return this.rankCandidates(candidates);
  }

  private buildContext(
    dtcCodes: DtcCode[],
    correlationFindings: CorrelationFinding[],
    severity: DiagnosisSeverity,
    idleFrames: ObdLiveFrame[],
    revFrames: ObdLiveFrame[],
  ): InferenceContext {
    const codes = new Set(dtcCodes.map(d => d.code));

    const avgIdleStft = idleFrames.length ? this.avg(idleFrames.map(f => f.stftB1)) : null;
    const avgRevStft  = revFrames.length  ? this.avg(revFrames.map(f => f.stftB1))  : null;
    const avgIdleLtft = idleFrames.length ? this.avg(idleFrames.map(f => f.ltftB1)) : null;
    const avgIdleRpm  = idleFrames.length ? this.avg(idleFrames.map(f => f.rpm))    : null;
    const avgRevRpm   = revFrames.length  ? this.avg(revFrames.map(f => f.rpm))     : null;
    const idleRpmStdDev = idleFrames.length >= 5 ? this.stddev(idleFrames.map(f => f.rpm)) : null;

    const idleMaf = idleFrames.filter(f => f.maf != null).map(f => f.maf!);
    const revMaf  = revFrames.filter(f => f.maf != null).map(f => f.maf!);
    let mafScalesWithRpm: boolean | null = null;
    if (idleMaf.length > 0 && revMaf.length > 0 && avgRevRpm !== null && avgIdleRpm !== null && avgRevRpm > avgIdleRpm + 500) {
      mafScalesWithRpm = this.avg(revMaf) >= this.avg(idleMaf) * 1.3;
    }

    return { codes, dtcCodes, correlationFindings, severity, avgIdleStft, avgRevStft, avgIdleLtft, idleRpmStdDev, avgIdleRpm, avgRevRpm, mafScalesWithRpm };
  }

  private rankCandidates(candidates: RootCauseCandidate[]): RootCauseCandidate[] {
    const confidenceScore = (c: 'Low' | 'Medium' | 'High') => c === 'High' ? 3 : c === 'Medium' ? 2 : 1;
    const ranked = candidates.sort((a, b) => confidenceScore(b.confidence) - confidenceScore(a.confidence));
    ranked.forEach((c, i) => { c.rank = i + 1; });
    return ranked;
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
