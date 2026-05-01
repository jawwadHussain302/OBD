import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import {
  CorrelationFinding,
  DiagnosisSeverity,
  DiagnosisRecommendation,
  HypothesisReport,
  RootCauseCandidate,
} from './diagnosis-intelligence.models';

type ConfidenceLevel = 'Low' | 'Medium' | 'High';

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { Low: 0, Medium: 1, High: 2 };

interface RootCauseRule {
  id: string;
  cause: string;
  hypothesisId: string;
  dtcTriggers: string[];
  correlationKeywords: string[];
  baseConfidence: ConfidenceLevel;
  buildExplanation: (dtcs: string[], correlations: string[]) => string;
}

const ROOT_CAUSE_RULES: RootCauseRule[] = [
  {
    id: 'vacuum-leak',
    cause: 'Vacuum / Intake Leak',
    hypothesisId: 'vacuum-leak',
    dtcTriggers: ['P0171', 'P0174'],
    correlationKeywords: ['vacuum', 'lean at idle', 'normalises at load', 'improves'],
    baseConfidence: 'Medium',
    buildExplanation: (dtcs, corrs) => {
      const parts: string[] = [];
      if (dtcs.length) parts.push(`Lean fuel trim code(s) (${dtcs.join(', ')}) indicate unmetered air entering the intake.`);
      if (corrs.length) parts.push('Correlation analysis shows a lean condition at idle that improves under load — a classic vacuum leak signature.');
      parts.push('A vacuum or intake leak allows extra air to bypass the throttle body, forcing lean fuel trim corrections.');
      return parts.join(' ');
    },
  },
  {
    id: 'fuel-delivery',
    cause: 'Fuel Delivery Fault',
    hypothesisId: 'fuel-delivery',
    dtcTriggers: ['P0171', 'P0174'],
    correlationKeywords: ['fuel delivery', 'fuel pressure', 'bilateral lean', 'both banks'],
    baseConfidence: 'Medium',
    buildExplanation: (dtcs, corrs) => {
      const parts: string[] = [];
      if (dtcs.length) parts.push(`Lean condition(s) (${dtcs.join(', ')}) across one or both banks may point to a fuel supply deficit.`);
      if (corrs.length) parts.push(`Correlation findings support a fuel delivery pattern: ${corrs[0]}.`);
      parts.push('A weak fuel pump, clogged filter, or failing pressure regulator can cause a global lean condition across all cylinders.');
      return parts.join(' ');
    },
  },
  {
    id: 'rich-injector',
    cause: 'Leaking or Rich Injector',
    hypothesisId: 'rich-injector',
    dtcTriggers: ['P0172', 'P0175'],
    correlationKeywords: ['rich', 'injector', 'negative trim', 'excess fuel'],
    baseConfidence: 'Medium',
    buildExplanation: (dtcs, corrs) => {
      const parts: string[] = [];
      if (dtcs.length) parts.push(`Rich fuel trim code(s) (${dtcs.join(', ')}) indicate excess fuel entering the combustion chamber.`);
      if (corrs.length) parts.push(`Correlation findings confirm a rich condition: ${corrs[0]}.`);
      parts.push('A leaking fuel injector or over-pressurised fuel system can cause persistently negative fuel trim corrections.');
      return parts.join(' ');
    },
  },
  {
    id: 'misfire-ignition',
    cause: 'Misfire / Ignition Fault',
    hypothesisId: 'misfire-ignition',
    dtcTriggers: ['P0300', 'P0301', 'P0302', 'P0303', 'P0304'],
    correlationKeywords: ['misfire', 'ignition', 'cylinder', 'combustion'],
    baseConfidence: 'Medium',
    buildExplanation: (dtcs, corrs) => {
      const specific = dtcs.filter(c => c !== 'P0300');
      const parts: string[] = [];
      if (dtcs.includes('P0300') && specific.length) {
        parts.push(`Random misfire (P0300) with cylinder-specific faults (${specific.join(', ')}) detected.`);
      } else if (specific.length) {
        parts.push(`Cylinder-specific misfire(s) detected (${specific.join(', ')}).`);
      } else {
        parts.push('Random misfire event detected (P0300).');
      }
      if (corrs.length) parts.push(`Correlation analysis: ${corrs[0]}.`);
      parts.push('Likely causes include worn spark plugs, failing ignition coils, or faulty injectors on the affected cylinders.');
      return parts.join(' ');
    },
  },
  {
    id: 'maf-sensor',
    cause: 'MAF Sensor or Intake Restriction',
    hypothesisId: 'maf-sensor',
    dtcTriggers: ['P0100', 'P0101', 'P0102', 'P0103', 'P0104'],
    correlationKeywords: ['maf', 'mass air', 'airflow', 'intake restriction'],
    baseConfidence: 'High',
    buildExplanation: (dtcs, corrs) => {
      const parts: string[] = [];
      if (dtcs.length) parts.push(`MAF sensor fault code(s) (${dtcs.join(', ')}) detected.`);
      if (corrs.length) parts.push(`Signal analysis: ${corrs[0]}.`);
      parts.push('A contaminated or failing MAF sensor — or a blocked air filter — causes incorrect airflow readings, disrupting fuel delivery and engine response.');
      return parts.join(' ');
    },
  },
  {
    id: 'catalyst',
    cause: 'Catalytic Converter Degradation',
    hypothesisId: 'catalyst',
    dtcTriggers: ['P0420', 'P0430'],
    correlationKeywords: ['catalyst', 'catalytic', 'oxygen sensor', 'o2 sensor'],
    baseConfidence: 'High',
    buildExplanation: (dtcs, corrs) => {
      const parts: string[] = [];
      if (dtcs.length) parts.push(`Catalyst efficiency code(s) (${dtcs.join(', ')}) indicate below-threshold converter performance.`);
      if (corrs.length) parts.push(`Correlation findings: ${corrs[0]}.`);
      parts.push('The catalytic converter is likely worn or contaminated. Rule out upstream O2 sensor faults before ordering a replacement converter.');
      return parts.join(' ');
    },
  },
];

@Injectable({ providedIn: 'root' })
export class RootCauseInferenceService {

  infer(
    dtcCodes: DtcCode[],
    correlationFindings: CorrelationFinding[],
    severity: DiagnosisSeverity,
    recommendations: DiagnosisRecommendation,
    hypothesisReport?: HypothesisReport,
  ): RootCauseCandidate[] {
    const presentCodes = new Set(dtcCodes.map(d => d.code));
    const candidates: RootCauseCandidate[] = [];

    for (const rule of ROOT_CAUSE_RULES) {
      const matchingDtcs = rule.dtcTriggers.filter(t => presentCodes.has(t));
      const matchingCorrelations = correlationFindings
        .filter(f => rule.correlationKeywords.some(kw => f.message.toLowerCase().includes(kw)))
        .map(f => f.message);

      if (!matchingDtcs.length && !matchingCorrelations.length) continue;

      let confidence: ConfidenceLevel = rule.baseConfidence;
      const evidence: string[] = [];

      for (const code of matchingDtcs) {
        const dtc = dtcCodes.find(d => d.code === code);
        evidence.push(dtc ? `${code}: ${dtc.title}` : code);
      }

      for (const msg of matchingCorrelations) {
        evidence.push(msg);
        confidence = this.boost(confidence);
      }

      if (hypothesisReport) {
        const hyp = hypothesisReport.hypotheses.find(h => h.id === rule.hypothesisId);
        if (hyp) {
          evidence.push(`Evidence graph confidence: ${Math.round(hyp.confidence * 100)}%`);
          if (hyp.confidence >= 0.7) {
            confidence = 'High';
          } else if (hyp.confidence >= 0.4 && confidence === 'Low') {
            confidence = 'Medium';
          }
          hyp.supports.slice(0, 2).forEach(s => evidence.push(s));
        }
      }

      // Bilateral lean (both banks) is more indicative of fuel delivery than a localised vacuum leak
      if (rule.id === 'fuel-delivery' && presentCodes.has('P0171') && presentCodes.has('P0174')) {
        confidence = this.boost(confidence);
        evidence.push('Both banks lean (P0171 + P0174) — global deficit points away from a localised vacuum leak');
      }

      // Multiple cylinder-specific misfires raise confidence
      if (rule.id === 'misfire-ignition' && matchingDtcs.filter(c => c !== 'P0300').length >= 2) {
        confidence = this.boost(confidence);
      }

      candidates.push({
        cause: rule.cause,
        explanation: rule.buildExplanation(matchingDtcs, matchingCorrelations),
        confidence,
        supportingEvidence: [...new Set(evidence)],
        rank: 0,
      });
    }

    candidates.sort((a, b) => {
      const diff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      return diff !== 0 ? diff : b.supportingEvidence.length - a.supportingEvidence.length;
    });

    candidates.forEach((c, i) => { c.rank = i + 1; });
    return candidates;
  }

  private boost(level: ConfidenceLevel): ConfidenceLevel {
    if (level === 'Low') return 'Medium';
    if (level === 'Medium') return 'High';
    return 'High';
  }
}
