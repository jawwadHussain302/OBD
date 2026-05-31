import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AI_FREEZE_FRAME_FUNCTION_URL } from './ai-endpoint.config';
import { AiUsageTrackerService } from './ai-usage-tracker.service';
import type { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import type { ObdLiveFrame } from '../models/obd-live-frame.model';
import type {
  FreezeFrameAiBackendResponse,
  FreezeFrameAiDebugSnapshot,
  FreezeFrameAiRequestPayload,
  FreezeFrameAiSample,
  FreezeFrameAiState,
  FreezeFrameAnalysisInput,
  FreezeFrameDiagnosisContext,
  FreezeFrameFrameSelection,
  FreezeFrameSampleSource,
  FreezeFrameVehicleContext,
} from './freeze-frame-ai.models';

const IDLE_STATE: FreezeFrameAiState = {
  status: 'idle',
  reportMarkdown: null,
  confidence: null,
  generatedAt: null,
  errorMessage: null,
  warnings: [],
};

const EMPTY_DEBUG: FreezeFrameAiDebugSnapshot = {
  generatedPrompt: null,
  requestPayload: null,
  rawResponse: null,
  errorResponse: null,
};

@Injectable({ providedIn: 'root' })
export class FreezeFrameAiService {
  private readonly stateSubject = new BehaviorSubject<FreezeFrameAiState>(IDLE_STATE);
  readonly state$: Observable<FreezeFrameAiState> = this.stateSubject.asObservable();

  private readonly debugSubject = new BehaviorSubject<FreezeFrameAiDebugSnapshot>(EMPTY_DEBUG);
  readonly debug$: Observable<FreezeFrameAiDebugSnapshot> = this.debugSubject.asObservable();

  private generation = 0;

  constructor(private readonly usageTracker: AiUsageTrackerService) {}

  reset(): void {
    this.generation++;
    this.stateSubject.next(IDLE_STATE);
    this.debugSubject.next(EMPTY_DEBUG);
  }

  async analyse(input: FreezeFrameAnalysisInput): Promise<void> {
    if (input.state.status !== 'completed') return;

    const generation = ++this.generation;
    const vehicleContext = this.buildVehicleContext(input.profile, input.state);
    const diagnosisContext = this.buildDiagnosisContext(input.state);
    const samples = this.buildSamples(input.frames, input.source, input.state);

    if (samples.length === 0) {
      this.fail(
        'No freeze-frame data available yet. Run live data or diagnosis first.',
        { generatedPrompt: null, requestPayload: null, rawResponse: null, errorResponse: { error: 'No frame samples available' } },
      );
      return;
    }

    const prompt = this.buildPrompt(vehicleContext, diagnosisContext, samples);
    const payload: FreezeFrameAiRequestPayload = {
      prompt,
      vehicleContext,
      diagnosisContext,
      samples,
      context: { source: 'obd-dashboard', feature: 'freeze-frame-ai' },
    };

    this.debugSubject.next({ generatedPrompt: prompt, requestPayload: payload, rawResponse: null, errorResponse: null });

    if (!this.usageTracker.canMakeCall()) {
      const stats = this.usageTracker.getStats();
      this.fail(`Monthly AI quota reached (${stats.used}/${stats.limit}).`, {
        generatedPrompt: prompt,
        requestPayload: payload,
        rawResponse: null,
        errorResponse: { error: 'Monthly AI quota reached' },
      });
      return;
    }

    this.stateSubject.next({
      status: 'loading',
      reportMarkdown: null,
      confidence: null,
      generatedAt: null,
      errorMessage: null,
      warnings: [],
    });

    try {
      const response = await fetch(AI_FREEZE_FRAME_FUNCTION_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({})) as FreezeFrameAiBackendResponse;
      if (this.generation !== generation) return;

      if (!response.ok || data.error) {
        this.fail(data.error ?? `Service error ${response.status}`, {
          generatedPrompt: prompt,
          requestPayload: payload,
          rawResponse: data.rawResponse ?? null,
          errorResponse: data,
        });
        return;
      }

      const report = typeof data.reportMarkdown === 'string' ? data.reportMarkdown.trim() : '';
      if (!report) {
        const message = data.warnings?.join(' ') || 'Unable to analyze freeze-frame data. Please try again.';
        this.fail(message, {
          generatedPrompt: prompt,
          requestPayload: payload,
          rawResponse: data.rawResponse ?? null,
          errorResponse: data,
        });
        return;
      }

      this.usageTracker.increment();
      this.debugSubject.next({
        generatedPrompt: prompt,
        requestPayload: payload,
        rawResponse: data.rawResponse ?? report,
        errorResponse: null,
      });
      this.stateSubject.next({
        status: 'ready',
        reportMarkdown: report,
        confidence: this.normalizeConfidence(data.confidence),
        generatedAt: Date.now(),
        errorMessage: null,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      });
    } catch (error) {
      if (this.generation !== generation) return;
      this.fail('Unable to analyze freeze-frame data. Please try again.', {
        generatedPrompt: prompt,
        requestPayload: payload,
        rawResponse: null,
        errorResponse: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  }

  private fail(message: string, debug: FreezeFrameAiDebugSnapshot): void {
    this.debugSubject.next(debug);
    this.stateSubject.next({
      status: 'error',
      reportMarkdown: null,
      confidence: null,
      generatedAt: Date.now(),
      errorMessage: message,
      warnings: [],
    });
  }

  private buildSamples(
    frames: readonly ObdLiveFrame[],
    source: FreezeFrameSampleSource,
    state: DeepDiagnosisState,
  ): FreezeFrameAiSample[] {
    return this.selectFrames(frames).map((selection, index) =>
      this.toSample(index + 1, selection, source, state),
    );
  }

  private selectFrames(frames: readonly ObdLiveFrame[]): FreezeFrameFrameSelection[] {
    const uniqueFrames = this.dedupeFrames(frames);
    if (uniqueFrames.length === 0) return [];
    if (uniqueFrames.length === 1) {
      return [{ frame: uniqueFrames[0], label: 'Earliest available relevant sample' }];
    }
    if (uniqueFrames.length === 2) {
      return [
        { frame: uniqueFrames[0], label: 'Earliest available relevant sample' },
        { frame: uniqueFrames[1], label: 'Latest available sample' },
      ];
    }
    if (uniqueFrames.length === 3) {
      return [
        { frame: uniqueFrames[0], label: 'Earliest available relevant sample' },
        { frame: uniqueFrames[1], label: 'Mid-stream sample' },
        { frame: uniqueFrames[2], label: 'Latest available sample' },
      ];
    }

    const lastIndex = uniqueFrames.length - 1;
    const preferred = [
      { index: 0, label: 'Earliest available relevant sample' },
      { index: Math.floor(lastIndex / 2), label: 'Mid-stream sample' },
      { index: this.findMostDiagnosticFrameIndex(uniqueFrames), label: 'Near issue/detection moment sample' },
      { index: lastIndex, label: 'Latest available sample' },
    ];

    const used = new Set<number>();
    return preferred.map(item => {
      const index = this.nearestUnusedIndex(item.index, used, uniqueFrames.length);
      used.add(index);
      return { frame: uniqueFrames[index], label: item.label };
    });
  }

  private dedupeFrames(frames: readonly ObdLiveFrame[]): ObdLiveFrame[] {
    const seen = new Set<string>();
    const result: ObdLiveFrame[] = [];
    for (const frame of frames) {
      const key = [
        frame.timestamp,
        frame.rpm,
        frame.speed,
        frame.engineLoad,
        frame.coolantTemp,
        frame.stftB1,
        frame.ltftB1,
        frame.maf ?? 'na',
        frame.map ?? 'na',
      ].join('|');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(frame);
      }
    }
    return result;
  }

  private nearestUnusedIndex(target: number, used: Set<number>, length: number): number {
    if (!used.has(target)) return target;
    for (let offset = 1; offset < length; offset++) {
      const lower = target - offset;
      const upper = target + offset;
      if (lower >= 0 && !used.has(lower)) return lower;
      if (upper < length && !used.has(upper)) return upper;
    }
    return target;
  }

  private findMostDiagnosticFrameIndex(frames: readonly ObdLiveFrame[]): number {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    frames.forEach((frame, index) => {
      const trimScore = Math.abs(frame.stftB1 ?? 0) + Math.abs(frame.ltftB1 ?? 0);
      const loadScore = Math.abs(frame.engineLoad ?? 0) / 5;
      const o2Spread = Math.abs((frame.o2S1B1 ?? 0) - (frame.o2S2B1 ?? 0)) * 5;
      const score = trimScore + loadScore + o2Spread + Math.abs(frame.throttlePosition ?? 0) / 20;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  private toSample(
    sampleNumber: number,
    selection: FreezeFrameFrameSelection,
    source: FreezeFrameSampleSource,
    state: DeepDiagnosisState,
  ): FreezeFrameAiSample {
    const frame = selection.frame;
    return {
      sampleNumber,
      label: selection.label,
      capturedAt: frame.timestamp ? new Date(frame.timestamp).toISOString() : undefined,
      source,
      engineState: {
        rpm: this.valueOrNull(frame.rpm),
        vehicleSpeed: this.valueOrNull(frame.speed),
        engineLoad: this.valueOrNull(frame.engineLoad),
        coolantTempC: this.valueOrNull(frame.coolantTemp),
        intakeAirTempC: this.valueOrNull(frame.intakeAirTemp),
        throttlePositionPct: this.valueOrNull(frame.throttlePosition),
      },
      fuelAirData: {
        stftB1Pct: this.valueOrNull(frame.stftB1),
        ltftB1Pct: this.valueOrNull(frame.ltftB1),
        stftB2Pct: null,
        ltftB2Pct: null,
        mafGps: this.valueOrNull(frame.maf),
        mapKpa: this.valueOrNull(frame.map),
        o2B1S1V: this.valueOrNull(frame.o2S1B1),
        o2B1S2V: this.valueOrNull(frame.o2S2B1),
        o2B2S1V: this.valueOrNull(frame.o2S1B2),
        o2B2S2V: this.valueOrNull(frame.o2S2B2),
      },
      diagnosticContext: {
        activeDtcs: (state.dtcCodes ?? []).map(dtc => dtc.code),
        pendingDtcs: [],
        confirmedDtcs: (state.dtcCodes ?? []).map(dtc => dtc.code),
        catalystStatus: this.extractCatalystStatus(state),
        misfireInfo: this.extractFinding(state, 'misfire'),
        readiness: state.isPartial ? 'partial diagnosis' : 'diagnosis completed',
      },
      rawValues: {
        timestamp: frame.timestamp,
        batteryVoltage: frame.batteryVoltage ?? null,
        connectionQuality: frame.connectionQuality ?? null,
      },
    };
  }

  private valueOrNull(value: number | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private extractFinding(state: DeepDiagnosisState, term: string): string | null {
    const allFindings = [...(state.findings ?? []), ...(state.dtcFindings ?? [])];
    return allFindings.find(finding => finding.toLowerCase().includes(term)) ?? null;
  }

  private extractCatalystStatus(state: DeepDiagnosisState): string | null {
    return this.extractFinding(state, 'catalyst') ?? this.extractFinding(state, 'p0420');
  }

  private buildVehicleContext(
    profile: FreezeFrameAnalysisInput['profile'],
    state: DeepDiagnosisState,
  ): FreezeFrameVehicleContext {
    const unknown = 'unknown';
    const displayName = profile
      ? [profile.year, profile.make, profile.model, profile.trimVariant, profile.engineSize, profile.fuelType]
          .filter(Boolean)
          .join(' ')
      : (state.vehicleNameSnapshot || unknown);

    return {
      displayName,
      make: profile?.make || unknown,
      model: profile?.model || unknown,
      year: profile?.year ? String(profile.year) : unknown,
      variant: profile?.trimVariant || unknown,
      trim: profile?.trimVariant || unknown,
      engine: profile?.engineSize || unknown,
      fuelType: profile?.fuelType || unknown,
      transmission: profile?.transmission || unknown,
      obdProtocol: profile?.detectedProtocol || unknown,
      vinIdentifier: profile?.vinPattern || this.maskVin(profile?.vin) || unknown,
      mileage: unknown,
    };
  }

  private maskVin(vin: string | undefined): string | null {
    const clean = vin?.trim();
    if (!clean) return null;
    if (clean.length <= 7) return 'masked VIN present';
    return `${clean.slice(0, 3)}*****${clean.slice(-4)}`;
  }

  private buildDiagnosisContext(state: DeepDiagnosisState): FreezeFrameDiagnosisContext {
    return {
      status: state.status,
      summary: state.diagnosisSummary?.summaryText || state.instruction || 'No diagnosis summary available',
      recommendedAction: state.diagnosisSummary?.recommendedAction || 'unknown',
      severity: state.severity ? `${state.severity.level} (${state.severity.score}/100)` : 'unknown',
      dtcs: (state.dtcCodes ?? []).map(dtc => `${dtc.code}: ${dtc.title}`),
      findings: [...(state.findings ?? []), ...(state.dtcFindings ?? [])].slice(0, 12),
      rootCauses: (state.rootCauses ?? []).slice(0, 5).map(cause =>
        `${cause.rank}. ${cause.title} (${cause.confidence}) - ${cause.explanation}`,
      ),
      isPartial: state.isPartial ?? false,
    };
  }

  private buildPrompt(
    vehicleContext: FreezeFrameVehicleContext,
    diagnosisContext: FreezeFrameDiagnosisContext,
    samples: FreezeFrameAiSample[],
  ): string {
    const sampleNote = samples.length < 4
      ? `Only ${samples.length} sample${samples.length === 1 ? '' : 's'} were available; do not infer missing readings.`
      : 'Four labelled samples are provided.';

    return [
      'You are an expert automotive diagnostic mechanic.',
      '',
      `Given below are ${samples.length} different freeze-frame/live-data sample${samples.length === 1 ? '' : 's'} from ${vehicleContext.displayName}. Analyze the data carefully and identify what looks abnormal, what may be causing the issue, and what the mechanic should test next.`,
      sampleNote,
      '',
      'Do not rely on one reading only. Compare all samples and look for patterns across RPM, load, fuel trims, MAF, throttle, coolant temperature, O2 sensor behavior, DTCs, and readiness context.',
      '',
      'Return:',
      '1. Overall assessment',
      '2. Abnormal readings found',
      '3. Most likely causes ranked by probability',
      '4. Supporting evidence from the samples',
      '5. What to inspect/test next',
      '6. What parts should NOT be replaced yet without confirmation',
      '7. Safety/driveability notes',
      '8. Confidence level',
      '',
      'Vehicle:',
      JSON.stringify(vehicleContext, null, 2),
      '',
      'Diagnosis summary:',
      JSON.stringify(diagnosisContext, null, 2),
      '',
      'Freeze-frame samples:',
      JSON.stringify(samples, null, 2),
    ].join('\n');
  }

  private normalizeConfidence(value: FreezeFrameAiBackendResponse['confidence']): 'low' | 'medium' | 'high' | null {
    const normalized = typeof value === 'string' ? value.toLowerCase() : '';
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
    return null;
  }
}
