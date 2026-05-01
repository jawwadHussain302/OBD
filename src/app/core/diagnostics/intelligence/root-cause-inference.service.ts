import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { ConfidenceLevel, CorrelationFinding, DiagnosisSeverity, Hypothesis, RootCauseCandidate } from './diagnosis-intelligence.models';

interface CauseTemplate {
  hypothesisId: string;
  title: string;
  explanation: string;
}

const CAUSE_TEMPLATES: CauseTemplate[] = [
  {
    hypothesisId: 'vacuum-leak',
    title: 'Vacuum / Intake Leak',
    explanation: 'Unmetered air is entering the intake system, causing a lean condition at idle that improves under load. Common sources include cracked intake hoses, failed PCV valve, or a loose manifold gasket.',
  },
  {
    hypothesisId: 'fuel-delivery',
    title: 'Fuel Delivery Fault',
    explanation: 'The engine is not receiving adequate fuel across the RPM range, pointing to a weak fuel pump, clogged fuel filter, or failing pressure regulator.',
  },
  {
    hypothesisId: 'rich-injector',
    title: 'Leaking or Over-fuelling Injector',
    explanation: 'One or more injectors are delivering excess fuel, creating a rich mixture. This is often caused by a stuck-open injector, high fuel pressure, or a faulty coolant temperature sensor reporting cold.',
  },
  {
    hypothesisId: 'misfire-ignition',
    title: 'Misfire / Ignition Fault',
    explanation: 'One or more cylinders are failing to ignite reliably. Worn spark plugs, a faulty ignition coil, or compression loss are the primary candidates.',
  },
  {
    hypothesisId: 'maf-sensor',
    title: 'MAF Sensor Fault',
    explanation: 'The mass airflow sensor is reporting an incorrect air quantity, causing the ECU to miscalculate fuel delivery. Contamination, wiring faults, or a failing sensor element are likely causes.',
  },
  {
    hypothesisId: 'catalyst',
    title: 'Catalytic Converter Degradation',
    explanation: 'The catalytic converter is no longer converting exhaust gases efficiently. This can result from physical damage, thermal ageing, or contamination by oil or coolant.',
  },
];

@Injectable({ providedIn: 'root' })
export class RootCauseInferenceService {

  infer(
    dtcCodes: DtcCode[],
    correlationFindings: CorrelationFinding[],
    severity: DiagnosisSeverity,
    hypotheses: Hypothesis[],
  ): RootCauseCandidate[] {
    if (hypotheses.length) {
      return this.fromHypotheses(hypotheses, correlationFindings);
    }
    return this.fromDtcsOnly(dtcCodes, correlationFindings, severity);
  }

  private fromHypotheses(
    hypotheses: Hypothesis[],
    correlationFindings: CorrelationFinding[],
  ): RootCauseCandidate[] {
    return hypotheses.map((h, i) => {
      const template = CAUSE_TEMPLATES.find(t => t.hypothesisId === h.id);
      const confirmedFindings = correlationFindings
        .filter(f => f.upgradesSeverity)
        .map(f => f.message.split('.')[0]);

      return {
        rank: i + 1,
        title: template?.title ?? h.title,
        explanation: template?.explanation ?? h.title,
        confidence: this.numericToLevel(h.confidence),
        supportingEvidence: [...h.supports, ...confirmedFindings].slice(0, 4),
      };
    });
  }

  private fromDtcsOnly(
    dtcCodes: DtcCode[],
    correlationFindings: CorrelationFinding[],
    severity: DiagnosisSeverity,
  ): RootCauseCandidate[] {
    if (!dtcCodes.length && !correlationFindings.length) return [];

    const codes = new Set(dtcCodes.map(c => c.code));
    const candidates: Array<{ id: string; score: number; evidence: string[] }> = [];

    if (codes.has('P0171') || codes.has('P0174')) {
      const confirmedLean = correlationFindings.some(f => f.upgradesSeverity && f.codes.some(c => c === 'P0171' || c === 'P0174'));
      candidates.push({ id: 'vacuum-leak',   score: confirmedLean ? 0.7 : 0.4, evidence: [...codes].filter(c => c === 'P0171' || c === 'P0174') });
      candidates.push({ id: 'fuel-delivery', score: confirmedLean ? 0.4 : 0.3, evidence: [...codes].filter(c => c === 'P0171' || c === 'P0174') });
    }

    if (codes.has('P0172') || codes.has('P0175')) {
      const confirmedRich = correlationFindings.some(f => f.upgradesSeverity && f.codes.some(c => c === 'P0172' || c === 'P0175'));
      candidates.push({ id: 'rich-injector', score: confirmedRich ? 0.75 : 0.45, evidence: [...codes].filter(c => c === 'P0172' || c === 'P0175') });
    }

    const misfireCodes = [...codes].filter(c => c >= 'P0300' && c <= 'P0304');
    if (misfireCodes.length) {
      const confirmedMisfire = correlationFindings.some(f => f.upgradesSeverity && f.codes.some(c => c >= 'P0300' && c <= 'P0304'));
      candidates.push({ id: 'misfire-ignition', score: confirmedMisfire ? 0.8 : 0.5, evidence: misfireCodes });
    }

    const mafCodes = [...codes].filter(c => c >= 'P0100' && c <= 'P0104');
    if (mafCodes.length) {
      const confirmedMaf = correlationFindings.some(f => f.upgradesSeverity && f.codes.some(c => c >= 'P0100' && c <= 'P0104'));
      candidates.push({ id: 'maf-sensor', score: confirmedMaf ? 0.8 : 0.55, evidence: mafCodes });
    }

    if (codes.has('P0420') || codes.has('P0430')) {
      candidates.push({ id: 'catalyst', score: 0.65, evidence: [...codes].filter(c => c === 'P0420' || c === 'P0430') });
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c, i) => {
        const template = CAUSE_TEMPLATES.find(t => t.hypothesisId === c.id)!;
        return {
          rank: i + 1,
          title: template.title,
          explanation: template.explanation,
          confidence: this.numericToLevel(c.score),
          supportingEvidence: c.evidence,
        };
      });
  }

  private numericToLevel(value: number): ConfidenceLevel {
    if (value >= 0.65) return 'High';
    if (value >= 0.40) return 'Medium';
    return 'Low';
  }
}
