import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import {
  ConfidenceLevel,
  CorrelationFinding,
  DiagnosisRecommendation,
  DiagnosisSeverity,
  RootCause,
  RootCauseReport,
} from './diagnosis-intelligence.models';

interface CauseCandidate {
  id: string;
  title: string;
  explanation: string;
  supportScore: number;
  contradictScore: number;
  evidence: string[];
}

const CAUSE_TEMPLATES: Omit<CauseCandidate, 'supportScore' | 'contradictScore' | 'evidence'>[] = [
  {
    id: 'vacuum-leak',
    title: 'Vacuum / Intake Leak',
    explanation: 'Lean fuel conditions with positive trim correction suggest unmetered air entering the intake system.',
  },
  {
    id: 'fuel-delivery',
    title: 'Fuel Delivery Fault',
    explanation: 'Persistent lean conditions indicate the fuel delivery system cannot maintain the correct air-fuel mixture.',
  },
  {
    id: 'rich-injector',
    title: 'Leaking or Rich Injector',
    explanation: 'Rich fuel conditions at idle point to excess fuel delivery, typically from a leaking or stuck-open injector.',
  },
  {
    id: 'misfire-ignition',
    title: 'Misfire / Ignition Fault',
    explanation: 'Misfire-related codes and RPM instability indicate an ignition system or mechanical fault.',
  },
  {
    id: 'maf-sensor',
    title: 'MAF Sensor Fault',
    explanation: 'MAF-related fault codes suggest the mass airflow sensor is not accurately measuring intake air volume.',
  },
  {
    id: 'catalyst',
    title: 'Catalytic Converter Degradation',
    explanation: 'Catalyst efficiency codes indicate the catalytic converter is no longer reducing exhaust emissions effectively.',
  },
];

// ── DTC scoring rules ─────────────────────────────────────────────────────────

interface DtcCauseRule {
  code: string;
  causeId: string;
  relation: 'supports' | 'contradicts';
  weight: number;
}

const DTC_CAUSE_RULES: DtcCauseRule[] = [
  { code: 'P0171', causeId: 'vacuum-leak',      relation: 'supports',    weight: 0.6 },
  { code: 'P0171', causeId: 'fuel-delivery',    relation: 'supports',    weight: 0.5 },
  { code: 'P0171', causeId: 'rich-injector',    relation: 'contradicts', weight: 0.7 },
  { code: 'P0174', causeId: 'vacuum-leak',      relation: 'supports',    weight: 0.6 },
  { code: 'P0174', causeId: 'fuel-delivery',    relation: 'supports',    weight: 0.5 },
  { code: 'P0174', causeId: 'rich-injector',    relation: 'contradicts', weight: 0.7 },
  { code: 'P0172', causeId: 'rich-injector',    relation: 'supports',    weight: 0.7 },
  { code: 'P0172', causeId: 'vacuum-leak',      relation: 'contradicts', weight: 0.6 },
  { code: 'P0172', causeId: 'fuel-delivery',    relation: 'contradicts', weight: 0.4 },
  { code: 'P0175', causeId: 'rich-injector',    relation: 'supports',    weight: 0.6 },
  { code: 'P0175', causeId: 'vacuum-leak',      relation: 'contradicts', weight: 0.6 },
  { code: 'P0300', causeId: 'misfire-ignition', relation: 'supports',    weight: 0.8 },
  { code: 'P0301', causeId: 'misfire-ignition', relation: 'supports',    weight: 0.7 },
  { code: 'P0302', causeId: 'misfire-ignition', relation: 'supports',    weight: 0.7 },
  { code: 'P0303', causeId: 'misfire-ignition', relation: 'supports',    weight: 0.7 },
  { code: 'P0304', causeId: 'misfire-ignition', relation: 'supports',    weight: 0.7 },
  { code: 'P0100', causeId: 'maf-sensor',       relation: 'supports',    weight: 0.7 },
  { code: 'P0101', causeId: 'maf-sensor',       relation: 'supports',    weight: 0.8 },
  { code: 'P0101', causeId: 'fuel-delivery',    relation: 'supports',    weight: 0.3 },
  { code: 'P0102', causeId: 'maf-sensor',       relation: 'supports',    weight: 0.8 },
  { code: 'P0103', causeId: 'maf-sensor',       relation: 'supports',    weight: 0.8 },
  { code: 'P0104', causeId: 'maf-sensor',       relation: 'supports',    weight: 0.7 },
  { code: 'P0420', causeId: 'catalyst',         relation: 'supports',    weight: 0.8 },
  { code: 'P0430', causeId: 'catalyst',         relation: 'supports',    weight: 0.8 },
];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class RootCauseInferenceService {

  infer(
    dtcCodes: DtcCode[],
    correlationFindings: CorrelationFinding[],
    severity: DiagnosisSeverity,
    _recommendations: DiagnosisRecommendation,
    liveFrames: ObdLiveFrame[] = [],
  ): RootCauseReport {
    const candidates = this.buildCandidates();

    this.applyDtcRules(dtcCodes, candidates);
    this.applyCorrelationRules(correlationFindings, candidates);
    this.applySignalRules(liveFrames, candidates);
    this.applySeverityBoost(severity, candidates);

    const causes = this.rankAndScore(candidates);
    return { causes, generatedAt: Date.now() };
  }

  // ── Scoring phases ────────────────────────────────────────────────────────

  private applyDtcRules(dtcCodes: DtcCode[], candidates: Map<string, CauseCandidate>): void {
    const codeSet = new Set(dtcCodes.map(d => d.code));

    for (const rule of DTC_CAUSE_RULES) {
      if (!codeSet.has(rule.code)) continue;
      const c = candidates.get(rule.causeId);
      if (!c) continue;

      if (rule.relation === 'supports') {
        c.supportScore += rule.weight;
        c.evidence.push(`Fault code ${rule.code}`);
      } else {
        c.contradictScore += rule.weight;
      }
    }
  }

  private applyCorrelationRules(findings: CorrelationFinding[], candidates: Map<string, CauseCandidate>): void {
    for (const finding of findings) {
      const msg = finding.message.toLowerCase();
      const w = finding.upgradesSeverity ? 0.4 : 0.2;

      const lean = msg.includes('lean') || msg.includes('p0171') || msg.includes('p0174');
      const rich = msg.includes('rich') || msg.includes('p0172') || msg.includes('p0175');
      const misfire = msg.includes('misfire') || msg.includes('p030');
      const maf = msg.includes('maf') || msg.includes('p010');

      if (lean) {
        this.support(candidates, 'vacuum-leak',   w,       `Correlation: ${finding.message}`);
        this.support(candidates, 'fuel-delivery', w * 0.8, `Correlation: ${finding.message}`);
      }
      if (rich)    this.support(candidates, 'rich-injector',    w, `Correlation: ${finding.message}`);
      if (misfire) this.support(candidates, 'misfire-ignition', w, `Correlation: ${finding.message}`);
      if (maf)     this.support(candidates, 'maf-sensor',       w, `Correlation: ${finding.message}`);
    }
  }

  private applySignalRules(frames: ObdLiveFrame[], candidates: Map<string, CauseCandidate>): void {
    if (!frames.length) return;

    const avgStft = this.avg(frames.map(f => f.stftB1));
    const avgLtft = this.avg(frames.map(f => f.ltftB1));

    if (avgStft > 10) {
      const label = `Lean idle STFT (avg ${avgStft.toFixed(1)}%)`;
      this.support(candidates, 'vacuum-leak',   0.5, label);
      this.support(candidates, 'fuel-delivery', 0.4, label);
    } else if (avgStft < -10) {
      this.support(candidates, 'rich-injector', 0.6, `Rich idle STFT (avg ${avgStft.toFixed(1)}%)`);
    }

    if (avgLtft > 15) {
      const label = `Elevated LTFT (avg ${avgLtft.toFixed(1)}%)`;
      this.support(candidates, 'fuel-delivery', 0.5, label);
      this.support(candidates, 'vacuum-leak',   0.3, label);
    }
  }

  // High-severity findings add a small boost to all already-supported causes
  // to ensure that signal agreement influences final ranking when scores are close.
  private applySeverityBoost(severity: DiagnosisSeverity, candidates: Map<string, CauseCandidate>): void {
    if (severity.level !== 'High' && severity.level !== 'Critical') return;
    for (const c of candidates.values()) {
      if (c.supportScore > 0) c.supportScore += 0.1;
    }
  }

  // ── Ranking and confidence scoring ────────────────────────────────────────

  private rankAndScore(candidates: Map<string, CauseCandidate>): RootCause[] {
    const results: RootCause[] = [];

    for (const c of candidates.values()) {
      if (c.supportScore === 0) continue;

      const confidenceScore = Math.min(1, c.supportScore / (c.supportScore + c.contradictScore + 0.001));

      results.push({
        id: c.id,
        title: c.title,
        explanation: c.explanation,
        confidence: this.toLevel(confidenceScore),
        confidenceScore,
        supportingEvidence: [...new Set(c.evidence)],
        rank: 0,
      });
    }

    results.sort((a, b) => b.confidenceScore - a.confidenceScore);
    results.forEach((r, i) => { r.rank = i + 1; });
    return results;
  }

  // ── Confidence level mapping (issue #104) ─────────────────────────────────
  // Thresholds are deterministic: based purely on signal/DTC agreement ratio.
  // ≥0.65 → High (strong multi-signal agreement), 0.35–0.65 → Medium, <0.35 → Low
  private toLevel(score: number): ConfidenceLevel {
    if (score >= 0.65) return 'High';
    if (score >= 0.35) return 'Medium';
    return 'Low';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildCandidates(): Map<string, CauseCandidate> {
    const map = new Map<string, CauseCandidate>();
    for (const t of CAUSE_TEMPLATES) {
      map.set(t.id, { ...t, supportScore: 0, contradictScore: 0, evidence: [] });
    }
    return map;
  }

  private support(candidates: Map<string, CauseCandidate>, id: string, weight: number, evidence: string): void {
    const c = candidates.get(id);
    if (c) { c.supportScore += weight; c.evidence.push(evidence); }
  }

  private avg(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }
}
