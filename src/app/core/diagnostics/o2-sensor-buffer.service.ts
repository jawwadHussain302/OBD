import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { AdapterSwitcherService } from '../adapters/adapter-switcher.service';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import type { CatalyticConverterInput } from './catalytic-converter-analysis.service';

// ── Public types ──────────────────────────────────────────────────────────────

export interface O2Frame {
  timestamp: number;
  upstream: number | null;
  downstream: number | null;
}

export interface O2BankAnalytics {
  upstreamSwitchingHz: number;
  downstreamSwitchingHz: number;
  crossCorrelation: number;
  downstreamIsStable: boolean;
  upstreamMean: number;
  downstreamMean: number;
  hasData: boolean;
  hasUpstreamData: boolean;
  hasDownstreamData: boolean;
}

export interface O2SensorBufferState {
  bank1Frames: O2Frame[];
  bank2Frames: O2Frame[];
  bank1Analytics: O2BankAnalytics;
  bank2Analytics: O2BankAnalytics;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** 60 s at 5 Hz (200 ms/frame) */
const BUFFER_SIZE = 300;

/** Recompute analytics every N frames to avoid per-frame overhead. */
const ANALYTICS_INTERVAL = 5;

/** O2 midpoint voltage — used for switching-frequency detection. */
const SWITCH_THRESHOLD_V = 0.45;

/** Downstream is "stable" when its std dev is below this level. */
const STABLE_STD_DEV_V = 0.08;

export const NO_ANALYTICS: O2BankAnalytics = {
  upstreamSwitchingHz: 0,
  downstreamSwitchingHz: 0,
  crossCorrelation: 0,
  downstreamIsStable: false,
  upstreamMean: 0,
  downstreamMean: 0,
  hasData: false,
  hasUpstreamData: false,
  hasDownstreamData: false,
};

// ── Pure analytics functions ──────────────────────────────────────────────────

/**
 * Normalize O2 voltage to volts.
 * Some adapters report in millivolts (e.g. 650 instead of 0.650).
 * Rule: value > 5 and ≤ 5000 → divide by 1000; 0–5 → keep; otherwise invalid.
 */
function normalizeO2Voltage(raw: number): number | null {
  if (raw > 5 && raw <= 5000) return raw / 1000;
  if (raw >= 0 && raw <= 5)   return raw;
  return null;
}

function switchingHz(voltages: number[], durationSeconds: number): number {
  if (voltages.length < 2 || durationSeconds <= 0) return 0;
  let crossings = 0;
  let above = voltages[0] > SWITCH_THRESHOLD_V;
  for (let i = 1; i < voltages.length; i++) {
    const nowAbove = voltages[i] > SWITCH_THRESHOLD_V;
    if (nowAbove !== above) { crossings++; above = nowAbove; }
  }
  return crossings / durationSeconds;
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]; sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : Math.abs(num / den);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function computeAnalytics(frames: O2Frame[]): O2BankAnalytics {
  const upVoltages  = frames.filter(f => f.upstream   !== null).map(f => f.upstream   as number);
  const downVoltages = frames.filter(f => f.downstream !== null).map(f => f.downstream as number);

  if (upVoltages.length < 5 && downVoltages.length < 5) return NO_ANALYTICS;

  const pairedFrames = frames.filter(f => f.upstream !== null && f.downstream !== null);
  const upPaired   = pairedFrames.map(f => f.upstream   as number);
  const downPaired = pairedFrames.map(f => f.downstream as number);

  const durationSec = frames.length * 0.2;
  const downMeanVolt = mean(downVoltages);
  const downStd = stdDev(downVoltages);
  const downstreamIsStable =
    downVoltages.length >= 5 &&
    downMeanVolt >= 0.45 && downMeanVolt <= 0.95 &&
    downStd < STABLE_STD_DEV_V;

  return {
    upstreamSwitchingHz:   switchingHz(upVoltages,   durationSec),
    downstreamSwitchingHz: switchingHz(downVoltages, durationSec),
    crossCorrelation: upPaired.length >= 5 ? pearsonCorrelation(upPaired, downPaired) : 0,
    downstreamIsStable,
    upstreamMean:   mean(upVoltages),
    downstreamMean: downMeanVolt,
    hasData: true,
    hasUpstreamData:   upVoltages.length >= 5,
    hasDownstreamData: downVoltages.length >= 5,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class O2SensorBufferService implements OnDestroy {
  private readonly adapter = inject(AdapterSwitcherService);
  private readonly sub: Subscription;

  private bank1Frames: O2Frame[] = [];
  private bank2Frames: O2Frame[] = [];
  private framesSinceAnalytics = 0;

  readonly state$ = new BehaviorSubject<O2SensorBufferState>({
    bank1Frames: [],
    bank2Frames: [],
    bank1Analytics: NO_ANALYTICS,
    bank2Analytics: NO_ANALYTICS,
  });

  constructor() {
    this.sub = this.adapter.data$.subscribe(frame => this.onFrame(frame));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /** Build the o2Sensors input for CatalyticConverterAnalysisService from the given bank. */
  buildCatalyticO2Input(bank: 1 | 2): CatalyticConverterInput['o2Sensors'] {
    const state = this.state$.getValue();
    const analytics = bank === 1 ? state.bank1Analytics : state.bank2Analytics;
    if (!analytics.hasData) return undefined;
    return {
      upstream:           { switchingHz: analytics.upstreamSwitchingHz },
      downstream:         { switchingHz: analytics.downstreamSwitchingHz },
      crossCorrelation:   analytics.crossCorrelation,
      downstreamIsStable: analytics.downstreamIsStable,
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private onFrame(frame: ObdLiveFrame): void {
    let changed = false;

    if (frame.o2S1B1 !== undefined || frame.o2S2B1 !== undefined) {
      this.bank1Frames.push({
        timestamp:  frame.timestamp,
        upstream:   frame.o2S1B1 != null ? normalizeO2Voltage(frame.o2S1B1) : null,
        downstream: frame.o2S2B1 != null ? normalizeO2Voltage(frame.o2S2B1) : null,
      });
      if (this.bank1Frames.length > BUFFER_SIZE) this.bank1Frames.shift();
      changed = true;
    }

    if (frame.o2S1B2 !== undefined || frame.o2S2B2 !== undefined) {
      this.bank2Frames.push({
        timestamp:  frame.timestamp,
        upstream:   frame.o2S1B2 != null ? normalizeO2Voltage(frame.o2S1B2) : null,
        downstream: frame.o2S2B2 != null ? normalizeO2Voltage(frame.o2S2B2) : null,
      });
      if (this.bank2Frames.length > BUFFER_SIZE) this.bank2Frames.shift();
      changed = true;
    }

    if (!changed) return;

    this.framesSinceAnalytics++;
    const recompute = this.framesSinceAnalytics >= ANALYTICS_INTERVAL;
    if (recompute) this.framesSinceAnalytics = 0;

    const prev = this.state$.getValue();
    this.state$.next({
      bank1Frames: this.bank1Frames,
      bank2Frames: this.bank2Frames,
      bank1Analytics: recompute ? computeAnalytics(this.bank1Frames) : prev.bank1Analytics,
      bank2Analytics: recompute ? computeAnalytics(this.bank2Frames) : prev.bank2Analytics,
    });
  }
}
