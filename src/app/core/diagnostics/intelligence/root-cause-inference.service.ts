import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { ConfidenceLevel, CorrelationFinding, DiagnosisSeverity, DriveSignature, RootCauseCandidate } from './diagnosis-intelligence.models';

const CONFIDENCE_SCORE: Record<ConfidenceLevel, number> = { High: 3, Medium: 2, Low: 1 };

@Injectable({ providedIn: 'root' })
export class RootCauseInferenceService {

  infer(
    dtcCodes: DtcCode[],
    correlationFindings: CorrelationFinding[],
    severity: DiagnosisSeverity,
    driveSignature?: DriveSignature
  ): RootCauseCandidate[] {
    const codes = new Set(dtcCodes.map(c => c.code));
    const candidates: RootCauseCandidate[] = [];

    const hasLean = codes.has('P0171') || codes.has('P0174');
    const hasRich = codes.has('P0172') || codes.has('P0175');
    const misfireCodes = dtcCodes.filter(c => /^P030[0-9]$/.test(c.code));
    const mafCodes = dtcCodes.filter(c => /^P010[0-4]$/.test(c.code));
    const hasCatalyst = codes.has('P0420') || codes.has('P0430');

    const vacuumLeakPattern = correlationFindings.some(f => f.message.includes('vacuum leak pattern'));
    const leanAcrossRpm = correlationFindings.some(f =>
      f.message.includes('across RPM') || f.message.includes('fuel delivery fault') || f.message.includes('fuel delivery')
    );
    const idleUnstable = driveSignature ? driveSignature.idleStability.stdDev > 150 : false;

    // ── Vacuum / intake leak ──────────────────────────────────────────────────
    if (hasLean) {
      candidates.push({
        rank: 0,
        title: 'Vacuum / Intake Leak',
        explanation: vacuumLeakPattern
          ? 'Lean condition at idle that normalises under load is the classic vacuum leak signature. Inspect intake hoses, PCV valve, and manifold gaskets.'
          : 'Lean code present — possible intake air leak, low fuel pressure, or contaminated MAF sensor.',
        confidence: vacuumLeakPattern ? 'High' : 'Medium',
        supportingEvidence: [
          ...dtcCodes.filter(c => ['P0171', 'P0174'].includes(c.code)).map(c => `${c.code}: ${c.title}`),
          ...(vacuumLeakPattern ? ['STFT lean at idle, trims normalise at higher RPM'] : []),
        ],
      });
    }

    // ── Fuel delivery ─────────────────────────────────────────────────────────
    if (hasLean && leanAcrossRpm) {
      candidates.push({
        rank: 0,
        title: 'Fuel Delivery Fault',
        explanation: 'Lean condition persists across the RPM range, suggesting insufficient fuel delivery. Check fuel pump pressure and injector flow.',
        confidence: 'Medium',
        supportingEvidence: ['Lean codes present', 'Trim correction persists across RPM range'],
      });
    }

    // ── Rich injector / fuel mixture ──────────────────────────────────────────
    if (hasRich) {
      const confirmed = correlationFindings.some(f => f.upgradesSeverity && f.codes.some(c => ['P0172', 'P0175'].includes(c)));
      candidates.push({
        rank: 0,
        title: 'Rich Fuel Mixture / Leaking Injector',
        explanation: 'Rich condition detected. A leaking injector, faulty fuel pressure regulator, or excess fuel delivery is likely.',
        confidence: confirmed ? 'High' : 'Medium',
        supportingEvidence: dtcCodes.filter(c => ['P0172', 'P0175'].includes(c.code)).map(c => `${c.code}: ${c.title}`),
      });
    }

    // ── Misfire / ignition ────────────────────────────────────────────────────
    if (misfireCodes.length) {
      const randomMisfire = misfireCodes.some(c => c.code === 'P0300');
      candidates.push({
        rank: 0,
        title: 'Misfire / Ignition System Fault',
        explanation: randomMisfire
          ? 'Random multi-cylinder misfire. Could be worn spark plugs, a failing coil pack, or fuel delivery issue.'
          : `Cylinder-specific misfire on ${misfireCodes.map(c => c.code).join(', ')}. Swap coil to isolate fault.`,
        confidence: idleUnstable ? 'High' : 'Medium',
        supportingEvidence: [
          ...misfireCodes.map(c => `${c.code}: ${c.title}`),
          ...(idleUnstable ? [`Idle RPM instability confirmed (σ = ${driveSignature!.idleStability.stdDev.toFixed(0)} RPM)`] : []),
        ],
      });
    }

    // ── MAF sensor ────────────────────────────────────────────────────────────
    if (mafCodes.length) {
      candidates.push({
        rank: 0,
        title: 'MAF Sensor Fault / Intake Restriction',
        explanation: 'MAF sensor circuit or signal fault detected. Dirty element, air leaks downstream of MAF, or sensor failure.',
        confidence: 'Medium',
        supportingEvidence: mafCodes.map(c => `${c.code}: ${c.title}`),
      });
    }

    // ── Catalytic converter ───────────────────────────────────────────────────
    if (hasCatalyst) {
      candidates.push({
        rank: 0,
        title: 'Catalytic Converter Degradation',
        explanation: 'Catalyst efficiency below threshold. Compare O2 sensor waveforms before replacing — misfires or oil burning can trigger false P0420.',
        confidence: 'Medium',
        supportingEvidence: dtcCodes.filter(c => ['P0420', 'P0430'].includes(c.code)).map(c => `${c.code}: ${c.title}`),
      });
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    if (!candidates.length && dtcCodes.length) {
      candidates.push({
        rank: 1,
        title: 'Unclassified Powertrain Fault',
        explanation: `${dtcCodes.length} fault code${dtcCodes.length > 1 ? 's' : ''} detected. Review DTC descriptions for component-specific diagnostics.`,
        confidence: 'Low',
        supportingEvidence: dtcCodes.map(c => `${c.code}: ${c.title}`),
      });
    }

    return candidates
      .sort((a, b) =>
        (CONFIDENCE_SCORE[b.confidence] - CONFIDENCE_SCORE[a.confidence]) ||
        (b.supportingEvidence.length - a.supportingEvidence.length)
      )
      .map((c, i) => ({ ...c, rank: i + 1 }));
  }
}
