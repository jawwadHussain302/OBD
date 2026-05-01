import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { ObdLiveFrame } from '../../models/obd-live-frame.model';
import {
  ContradictionFinding,
  DriveSignature,
  EvidenceEdge,
  EvidenceGraph,
  EvidenceNode,
  Hypothesis,
  HypothesisReport,
} from './diagnosis-intelligence.models';
import { BaselineEnvelope, DEFAULT_BASELINE } from './baseline-envelope';

// ── Static knowledge base ─────────────────────────────────────────────────────

interface HypothesisTemplate { id: string; title: string; }

const HYPOTHESIS_TEMPLATES: HypothesisTemplate[] = [
  { id: 'vacuum-leak',      title: 'Vacuum / Intake Leak' },
  { id: 'fuel-delivery',    title: 'Fuel Delivery Fault' },
  { id: 'rich-injector',    title: 'Leaking or Rich Injector' },
  { id: 'misfire-ignition', title: 'Misfire / Ignition Fault' },
  { id: 'maf-sensor',       title: 'MAF Sensor Fault' },
  { id: 'catalyst',         title: 'Catalytic Converter Degradation' },
];

interface DtcRule {
  code: string;
  hypothesisId: string;
  relation: 'supports' | 'contradicts';
  weight: number;
}

const DTC_RULES: DtcRule[] = [
  { code: 'P0171', hypothesisId: 'vacuum-leak',      relation: 'supports',    weight: 0.6 },
  { code: 'P0171', hypothesisId: 'fuel-delivery',    relation: 'supports',    weight: 0.5 },
  { code: 'P0171', hypothesisId: 'rich-injector',    relation: 'contradicts', weight: 0.7 },
  { code: 'P0174', hypothesisId: 'vacuum-leak',      relation: 'supports',    weight: 0.6 },
  { code: 'P0174', hypothesisId: 'fuel-delivery',    relation: 'supports',    weight: 0.5 },
  { code: 'P0174', hypothesisId: 'rich-injector',    relation: 'contradicts', weight: 0.7 },
  { code: 'P0172', hypothesisId: 'rich-injector',    relation: 'supports',    weight: 0.7 },
  { code: 'P0172', hypothesisId: 'vacuum-leak',      relation: 'contradicts', weight: 0.6 },
  { code: 'P0172', hypothesisId: 'fuel-delivery',    relation: 'contradicts', weight: 0.4 },
  { code: 'P0175', hypothesisId: 'rich-injector',    relation: 'supports',    weight: 0.6 },
  { code: 'P0175', hypothesisId: 'vacuum-leak',      relation: 'contradicts', weight: 0.6 },
  { code: 'P0300', hypothesisId: 'misfire-ignition', relation: 'supports',    weight: 0.8 },
  { code: 'P0301', hypothesisId: 'misfire-ignition', relation: 'supports',    weight: 0.7 },
  { code: 'P0302', hypothesisId: 'misfire-ignition', relation: 'supports',    weight: 0.7 },
  { code: 'P0303', hypothesisId: 'misfire-ignition', relation: 'supports',    weight: 0.7 },
  { code: 'P0304', hypothesisId: 'misfire-ignition', relation: 'supports',    weight: 0.7 },
  { code: 'P0100', hypothesisId: 'maf-sensor',       relation: 'supports',    weight: 0.7 },
  { code: 'P0101', hypothesisId: 'maf-sensor',       relation: 'supports',    weight: 0.8 },
  { code: 'P0101', hypothesisId: 'fuel-delivery',    relation: 'supports',    weight: 0.3 },
  { code: 'P0102', hypothesisId: 'maf-sensor',       relation: 'supports',    weight: 0.8 },
  { code: 'P0103', hypothesisId: 'maf-sensor',       relation: 'supports',    weight: 0.8 },
  { code: 'P0104', hypothesisId: 'maf-sensor',       relation: 'supports',    weight: 0.7 },
  { code: 'P0420', hypothesisId: 'catalyst',         relation: 'supports',    weight: 0.8 },
  { code: 'P0430', hypothesisId: 'catalyst',         relation: 'supports',    weight: 0.8 },
];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class EvidenceGraphService {

  // #89 — Build evidence graph linking DTCs, signals, and signatures
  buildGraph(
    dtcCodes: DtcCode[],
    idleFrames: ObdLiveFrame[],
    revFrames: ObdLiveFrame[],
    signature: DriveSignature,
    baseline: BaselineEnvelope = DEFAULT_BASELINE,
  ): EvidenceGraph {
    const nodes: EvidenceNode[] = [];
    const edges: EvidenceEdge[] = [];

    for (const h of HYPOTHESIS_TEMPLATES) {
      nodes.push({ id: h.id, type: 'hypothesis', label: h.title });
    }

    this.addDtcNodes(dtcCodes, nodes, edges);
    this.addSignalNodes(idleFrames, revFrames, nodes, edges);
    this.addSignatureNodes(signature, baseline, nodes, edges);

    return { nodes, edges };
  }

  // #91 — Detect contradictory signals/evidence
  detectContradictions(
    dtcCodes: DtcCode[],
    idleFrames: ObdLiveFrame[],
  ): ContradictionFinding[] {
    const findings: ContradictionFinding[] = [];
    const codes = new Set(dtcCodes.map(c => c.code));
    const avgIdleStft = idleFrames.length
      ? this.avg(idleFrames.map(f => f.stftB1))
      : null;
    const idleVariance = idleFrames.length >= 5
      ? this.variance(idleFrames.map(f => f.rpm))
      : null;

    if ((codes.has('P0171') || codes.has('P0174')) && avgIdleStft !== null && avgIdleStft < -5) {
      findings.push({
        description: 'Lean DTC present but fuel trims are rich at idle — conflicting evidence, possible intermittent condition or sensor fault.',
        nodeALabel: 'Lean fault code (P0171/P0174)',
        nodeBLabel: `Rich idle STFT (${avgIdleStft.toFixed(1)}%)`,
      });
    }

    const misfireCodes = [...codes].filter(c => c >= 'P0300' && c <= 'P0304');
    if (misfireCodes.length && idleVariance !== null && idleVariance < 50 * 50) {
      findings.push({
        description: 'Misfire code present but idle RPM is stable — misfire may be intermittent or load-dependent.',
        nodeALabel: `Misfire code (${misfireCodes.join(', ')})`,
        nodeBLabel: `Stable idle RPM (σ: ${Math.round(Math.sqrt(idleVariance))} RPM)`,
      });
    }

    if ((codes.has('P0172') || codes.has('P0175')) && avgIdleStft !== null && avgIdleStft > 10) {
      findings.push({
        description: 'Rich DTC present but fuel trims are lean at idle — conflicting evidence.',
        nodeALabel: 'Rich fault code (P0172/P0175)',
        nodeBLabel: `Lean idle STFT (${avgIdleStft.toFixed(1)}%)`,
      });
    }

    return findings;
  }

  // #90 (confidence) + #92 (ranking) — Score and rank top-3 hypotheses
  rankHypotheses(graph: EvidenceGraph): Hypothesis[] {
    const hypothesisNodes = graph.nodes.filter(n => n.type === 'hypothesis');
    const scored: Hypothesis[] = [];

    for (const hyp of hypothesisNodes) {
      const incoming = graph.edges.filter(e => e.toId === hyp.id);
      const supportEdges    = incoming.filter(e => e.relation === 'supports');
      const contradictEdges = incoming.filter(e => e.relation === 'contradicts');

      if (!supportEdges.length) continue;

      const sw = supportEdges.reduce((s, e) => s + e.weight, 0);
      const cw = contradictEdges.reduce((s, e) => s + e.weight, 0);
      const confidence = sw / (sw + cw + 0.001);

      const labelFor = (e: EvidenceEdge) =>
        graph.nodes.find(n => n.id === e.fromId)?.label ?? e.fromId;

      scored.push({
        id: hyp.id,
        title: hyp.label,
        confidence: Math.min(1, confidence),
        rank: 0,
        supports:      supportEdges.map(labelFor),
        contradictions: contradictEdges.map(labelFor),
      });
    }

    const ranked = scored.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
    ranked.forEach((h, i) => { h.rank = i + 1; });
    return ranked;
  }

  // #93 — Generate explainable output report
  generateReport(
    hypotheses: Hypothesis[],
    contradictions: ContradictionFinding[],
  ): HypothesisReport {
    return { hypotheses, contradictions, generatedAt: Date.now() };
  }

  // ── Node builders ─────────────────────────────────────────────────────────

  private addDtcNodes(
    dtcCodes: DtcCode[],
    nodes: EvidenceNode[],
    edges: EvidenceEdge[],
  ): void {
    for (const dtc of dtcCodes) {
      const id = `dtc-${dtc.code}`;
      nodes.push({ id, type: 'dtc', label: `${dtc.code}: ${dtc.title}` });
      for (const rule of DTC_RULES) {
        if (rule.code === dtc.code) {
          edges.push({ fromId: id, toId: rule.hypothesisId, relation: rule.relation, weight: rule.weight });
        }
      }
    }
  }

  private addSignalNodes(
    idleFrames: ObdLiveFrame[],
    revFrames: ObdLiveFrame[],
    nodes: EvidenceNode[],
    edges: EvidenceEdge[],
  ): void {
    if (!idleFrames.length && !revFrames.length) return;

    const avgIdleStft = idleFrames.length ? this.avg(idleFrames.map(f => f.stftB1)) : null;
    const avgRevStft  = revFrames.length  ? this.avg(revFrames.map(f => f.stftB1))  : null;
    const avgIdleLtft = idleFrames.length ? this.avg(idleFrames.map(f => f.ltftB1)) : null;

    if (avgIdleStft !== null && avgIdleStft > 10) {
      const id = 'sig-lean-idle';
      nodes.push({ id, type: 'signal', label: `Lean idle STFT (avg ${avgIdleStft.toFixed(1)}%)` });

      if (avgRevStft !== null && avgRevStft < 5) {
        // Lean at idle, normalises at load — vacuum leak pattern
        edges.push({ fromId: id, toId: 'vacuum-leak',   relation: 'supports',    weight: 0.8 });
        edges.push({ fromId: id, toId: 'fuel-delivery', relation: 'contradicts', weight: 0.3 });
      } else {
        // Lean across RPM range — fuel delivery
        edges.push({ fromId: id, toId: 'vacuum-leak',   relation: 'supports', weight: 0.5 });
        edges.push({ fromId: id, toId: 'fuel-delivery', relation: 'supports', weight: 0.6 });
      }
    }

    if (avgIdleStft !== null && avgIdleStft < -10) {
      const id = 'sig-rich-idle';
      nodes.push({ id, type: 'signal', label: `Rich idle STFT (avg ${avgIdleStft.toFixed(1)}%)` });
      edges.push({ fromId: id, toId: 'rich-injector', relation: 'supports',    weight: 0.7 });
      edges.push({ fromId: id, toId: 'vacuum-leak',   relation: 'contradicts', weight: 0.5 });
    }

    if (avgIdleLtft !== null && avgIdleLtft > 15) {
      const id = 'sig-high-ltft';
      nodes.push({ id, type: 'signal', label: `Elevated long-term fuel trim (avg ${avgIdleLtft.toFixed(1)}%)` });
      edges.push({ fromId: id, toId: 'fuel-delivery', relation: 'supports', weight: 0.6 });
      edges.push({ fromId: id, toId: 'vacuum-leak',   relation: 'supports', weight: 0.4 });
    }

    // MAF not scaling with RPM
    const idleMafVals = idleFrames.filter(f => f.maf != null).map(f => f.maf!);
    const revMafVals  = revFrames.filter(f => f.maf != null).map(f => f.maf!);
    const avgIdleRpm  = idleFrames.length ? this.avg(idleFrames.map(f => f.rpm)) : 0;
    const avgRevRpm   = revFrames.length  ? this.avg(revFrames.map(f => f.rpm))  : 0;
    if (
      idleMafVals.length > 0 && revMafVals.length > 0 &&
      avgRevRpm > avgIdleRpm + 500 &&
      this.avg(revMafVals) < this.avg(idleMafVals) * 1.3
    ) {
      const id = 'sig-maf-flat';
      nodes.push({ id, type: 'signal', label: 'MAF reading did not increase with RPM' });
      edges.push({ fromId: id, toId: 'maf-sensor',    relation: 'supports', weight: 0.8 });
      edges.push({ fromId: id, toId: 'fuel-delivery', relation: 'supports', weight: 0.3 });
    }
  }

  private addSignatureNodes(
    sig: DriveSignature,
    baseline: BaselineEnvelope,
    nodes: EvidenceNode[],
    edges: EvidenceEdge[],
  ): void {
    if (sig.idleStability.stdDev > baseline.idleStability.maxStdDev) {
      const id = 'signat-idle-unstable';
      nodes.push({ id, type: 'signature', label: `Idle instability (RPM σ: ${Math.round(sig.idleStability.stdDev)})` });
      edges.push({ fromId: id, toId: 'misfire-ignition', relation: 'supports', weight: 0.6 });
      edges.push({ fromId: id, toId: 'vacuum-leak',      relation: 'supports', weight: 0.4 });
    }

    if (sig.revResponse.riseTimeMs > baseline.revResponse.maxRiseTimeMs) {
      const id = 'signat-slow-rev';
      nodes.push({ id, type: 'signature', label: `Slow rev response (${Math.round(sig.revResponse.riseTimeMs)}ms rise time)` });
      edges.push({ fromId: id, toId: 'fuel-delivery', relation: 'supports', weight: 0.4 });
      edges.push({ fromId: id, toId: 'maf-sensor',    relation: 'supports', weight: 0.3 });
    }

    if (sig.holdStability.stdDev > baseline.holdStability.maxStdDev) {
      const id = 'signat-hold-unstable';
      nodes.push({ id, type: 'signature', label: `Hold instability at 2–3k RPM (RPM σ: ${Math.round(sig.holdStability.stdDev)})` });
      edges.push({ fromId: id, toId: 'misfire-ignition', relation: 'supports', weight: 0.5 });
    }

    if (sig.revResponse.overshoot > baseline.revResponse.maxOvershoot) {
      const id = 'signat-overshoot';
      nodes.push({ id, type: 'signature', label: `Rev overshoot (${Math.round(sig.revResponse.overshoot)} RPM above target)` });
      edges.push({ fromId: id, toId: 'misfire-ignition', relation: 'supports', weight: 0.3 });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private avg(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  private variance(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = this.avg(arr);
    return arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
  }
}
