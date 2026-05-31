import type { DiagnosisSeverity, RootCauseCandidate } from '../diagnostics/intelligence/diagnosis-intelligence.models';

export type FreezeFrameAiSampleSource =
  | 'obd_freeze_frame'
  | 'live_buffer'
  | 'session_snapshot'
  | 'simulator'
  | 'unknown';

export interface FreezeFrameAiSample {
  sampleNumber: number;
  label: string;
  capturedAt?: string;
  source: FreezeFrameAiSampleSource;
  engineState: {
    rpm: number | null;
    vehicleSpeed: number | null;
    engineLoad: number | null;
    coolantTempC: number | null;
    intakeAirTempC: number | null;
    throttlePositionPct: number | null;
  };
  fuelAirData: {
    stftB1Pct: number | null;
    ltftB1Pct: number | null;
    stftB2Pct: number | null;
    ltftB2Pct: number | null;
    mafGps: number | null;
    mapKpa: number | null;
    o2B1S1V: number | null;
    o2B1S2V: number | null;
    o2B2S1V: number | null;
    o2B2S2V: number | null;
  };
  diagnosticContext: {
    activeDtcs: string[];
    pendingDtcs: string[];
    confirmedDtcs: string[];
    catalystStatus: string | null;
    misfireInfo: unknown;
    readiness: unknown;
  };
  rawValues: Record<string, unknown>;
}

export interface FreezeFrameVehicleContext {
  make: string | null;
  model: string | null;
  year: number | null;
  variant: string | null;
  trim: string | null;
  engine: string | null;
  fuelType: string | null;
  transmission: string | null;
  obdProtocol: string | null;
  safeVinIdentifier: string | null;
  mileage: string | null;
}

export interface FreezeFrameDiagnosisContext {
  status: string;
  summaryText: string | null;
  recommendedAction: string | null;
  severity: DiagnosisSeverity | null;
  dtcs: string[];
  findings: string[];
  rootCauses: RootCauseCandidate[];
  isPartial: boolean;
}

export interface FreezeFrameAiRequestPayload {
  source: 'obd-dashboard-freeze-frame';
  generatedAt: string;
  vehicleContext: FreezeFrameVehicleContext;
  diagnosisSummary: FreezeFrameDiagnosisContext;
  samples: FreezeFrameAiSample[];
  prompt: string;
}

export interface FreezeFrameAiDebugSnapshot {
  generatedPrompt: string | null;
  requestPayload: FreezeFrameAiRequestPayload | null;
  rawResponse: string | null;
  errorResponse: string | null;
}

export interface FreezeFrameAiAnalysisState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  report: string | null;
  warningMessage: string | null;
  errorMessage: string | null;
  debug: FreezeFrameAiDebugSnapshot;
}

export interface FreezeFrameAiBackendResponse {
  requestId?: string;
  reportMarkdown?: string;
  rawResponse?: string;
  warning?: string;
  error?: string;
}
