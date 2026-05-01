import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import { ConfidenceLevel, CorrelationFinding } from './diagnosis-intelligence.models';

@Injectable({ providedIn: 'root' })
export class DtcCorrelationService {

  correlate(
    dtcCodes: DtcCode[],
    idleFrames: ObdLiveFrame[],
    revFrames: ObdLiveFrame[]
  ): CorrelationFinding[] {
    if (!dtcCodes.length) return [];

    const findings: CorrelationFinding[] = [];
    const codes = new Set(dtcCodes.map(c => c.code));

    // ── Lean condition: P0171 / P0174 ────────────────────────────────────────
    const leanCodes = ['P0171', 'P0174'].filter(c => codes.has(c));
    if (leanCodes.length) {
      const idleStft = idleFrames.length ? this.avg(idleFrames.map(f => f.stftB1)) : null;
      if (idleStft === null) {
        findings.push({
          codes: leanCodes,
          message: `${leanCodes.join(', ')}: Lean code present but no idle frame data captured — cannot confirm with live trims. Evaluate under test conditions.`,
          upgradesSeverity: false,
          confidence: 'Low',
        });
      } else if (idleStft > 10) {
        const revStft = revFrames.length ? this.avg(revFrames.map(f => f.stftB1)) : null;
        if (revStft !== null && revStft < 5) {
          findings.push({
            codes: leanCodes,
            message:
              `${leanCodes.join(', ')}: Lean at idle, trims normalise under load — vacuum leak pattern. ` +
              'Inspect intake hoses, PCV valve, and intake manifold gaskets.',
            upgradesSeverity: true,
            confidence: 'High',
          });
        } else {
          findings.push({
            codes: leanCodes,
            message:
              `${leanCodes.join(', ')}: Lean condition across RPM range — possible fuel delivery fault or contaminated MAF sensor. ` +
              'Check fuel pressure and MAF sensor.',
            upgradesSeverity: true,
            confidence: revStft !== null ? 'High' : 'Medium',
          });
        }
      } else {
        findings.push({
          codes: leanCodes,
          message: `${leanCodes.join(', ')}: Lean code present but trims within normal range during test — condition may be intermittent.`,
          upgradesSeverity: false,
          confidence: 'Medium',
        });
      }
    }

    // ── Rich condition: P0172 / P0175 ────────────────────────────────────────
    const richCodes = ['P0172', 'P0175'].filter(c => codes.has(c));
    if (richCodes.length) {
      const idleStft = idleFrames.length ? this.avg(idleFrames.map(f => f.stftB1)) : null;
      if (idleStft === null) {
        findings.push({
          codes: richCodes,
          message: `${richCodes.join(', ')}: Rich code present but no idle frame data captured — cannot confirm with live trims. Inspect fuel injectors and check fuel pressure.`,
          upgradesSeverity: false,
          confidence: 'Low',
        });
      } else {
        const confirmed = idleStft < -10;
        findings.push({
          codes: richCodes,
          message: confirmed
            ? `${richCodes.join(', ')}: Rich condition confirmed — possible leaking injector, high fuel pressure, or faulty coolant temp sensor.`
            : `${richCodes.join(', ')}: Rich code present but trims within normal range during test — inspect fuel injectors and check fuel pressure.`,
          upgradesSeverity: confirmed,
          confidence: confirmed ? 'High' : 'Medium',
        });
      }
    }

    // ── Misfire: P0300–P0304 ─────────────────────────────────────────────────
    const misfireCodes = [...codes].filter(c => c >= 'P0300' && c <= 'P0304');
    if (misfireCodes.length) {
      const rpmStdDev = idleFrames.length >= 5 ? this.stddev(idleFrames.map(f => f.rpm)) : null;
      if (rpmStdDev === null) {
        findings.push({
          codes: misfireCodes,
          message: `${misfireCodes.join(', ')}: Misfire code present but insufficient idle data to evaluate RPM stability — inspect spark plugs and coils.`,
          upgradesSeverity: false,
          confidence: 'Low',
        });
      } else {
        const active = rpmStdDev > 80;
        findings.push({
          codes: misfireCodes,
          message: active
            ? `${misfireCodes.join(', ')}: RPM instability at idle (±${Math.round(rpmStdDev)} RPM) confirms active misfire. ` +
              'Inspect spark plugs, ignition coils, and fuel injectors.'
            : `${misfireCodes.join(', ')}: Misfire code present but RPM stable during test — condition may be intermittent. Inspect spark plugs and coils.`,
          upgradesSeverity: active,
          confidence: active ? 'High' : 'Medium',
        });
      }
    }

    // ── MAF: P0100–P0104 ─────────────────────────────────────────────────────
    const mafCodes = [...codes].filter(c => c >= 'P0100' && c <= 'P0104');
    if (mafCodes.length) {
      const idleMaf  = idleFrames.filter(f => f.maf != null).map(f => f.maf!);
      const revMaf   = revFrames.filter(f => f.maf != null).map(f => f.maf!);
      const rpmIdle  = idleFrames.length ? this.avg(idleFrames.map(f => f.rpm)) : 0;
      const rpmRev   = revFrames.length  ? this.avg(revFrames.map(f => f.rpm))  : 0;
      const noResponse = idleMaf.length > 0 && revMaf.length > 0 &&
                         rpmRev > rpmIdle + 500 &&
                         this.avg(revMaf) < this.avg(idleMaf) * 1.3;
      const hasBothSignals = idleMaf.length > 0 && revMaf.length > 0;
      findings.push({
        codes: mafCodes,
        message: noResponse
          ? `${mafCodes.join(', ')}: MAF reading did not increase with RPM — sensor fault or airflow restriction. ` +
            'Inspect air filter and MAF sensor wiring.'
          : `${mafCodes.join(', ')}: MAF code detected — clean or replace MAF sensor, inspect air filter.`,
        upgradesSeverity: noResponse,
        confidence: noResponse ? 'High' : (idleMaf.length > 0 ? 'Medium' : 'Low'),
      });
    }

    // ── Catalyst: P0420 / P0430 ──────────────────────────────────────────────
    const catCodes = ['P0420', 'P0430'].filter(c => codes.has(c));
    if (catCodes.length) {
      findings.push({
        codes: catCodes,
        message:
          `${catCodes.join(', ')}: Catalyst efficiency below threshold. ` +
          'Compare upstream/downstream O2 sensor waveforms and check for oil or coolant burning.',
        upgradesSeverity: false,
        confidence: 'Medium',
      });
    }

    findings.push(...this.detectMultiDtcPatterns(codes));

    return findings;
  }

  private detectMultiDtcPatterns(codes: Set<string>): CorrelationFinding[] {
    const findings: CorrelationFinding[] = [];

    if (codes.has('P0171') && codes.has('P0101')) {
      findings.push({
        codes: ['P0171', 'P0101'],
        message: 'P0171 + P0101: Combined lean and MAF fault — likely air intake or airflow restriction. Inspect MAF sensor, air filter, and intake ducts for leaks.',
        upgradesSeverity: true,
        confidence: 'High',
      });
    }

    if (codes.has('P0300') && codes.has('P0171')) {
      findings.push({
        codes: ['P0300', 'P0171'],
        message: 'P0300 + P0171: Random misfire with lean condition — lean fuel mixture likely starving cylinders. Resolve lean fault first; inspect fuel delivery and vacuum integrity.',
        upgradesSeverity: true,
        confidence: 'High',
      });
    }

    if (codes.has('P0300') && codes.has('P0172')) {
      findings.push({
        codes: ['P0300', 'P0172'],
        message: 'P0300 + P0172: Random misfire with rich condition — excess fuel may be washing cylinder walls. Inspect injectors and fuel pressure regulator.',
        upgradesSeverity: true,
        confidence: 'High',
      });
    }

    if (codes.has('P0420') && codes.has('P0300')) {
      findings.push({
        codes: ['P0420', 'P0300'],
        message: 'P0420 + P0300: Catalyst inefficiency alongside misfire — unburned fuel from misfires may be degrading the catalytic converter. Resolve misfire fault first.',
        upgradesSeverity: false,
        confidence: 'Medium',
      });
    }

    return findings;
  }

  private avg(arr: number[]): number {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private stddev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = this.avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length);
  }
}
