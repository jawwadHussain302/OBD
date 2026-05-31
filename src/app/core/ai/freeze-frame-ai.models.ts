import type { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import type { ObdLiveFrame } from '../models/obd-live-frame.model';
import type { VehicleProfile } from '../models/vehicle-profile.model';

export type FreezeFrameSampleSource =
  | 'obd_freeze_frame'
  | 'live_buffer'
  | 'session_snapshot'
  | 'simulator'
  | 'unknown';

export interface FreezeFrameVehicleContext {
  displayName: string;
  make: string;
  model: string;
  year: string;
  variant: string;
  trim: string;
  engine: string;
  fuelType: string;
  transmission: string;
  obdProtocol: string;
  vinIdentifier: string;
  mileage: string;
}

export interface FreezeFrameDiagnosisContext {
  status: DeepDiagnosisState['status'];
  summary: string;
  recommendedAction: string;
  severity: string;
  dtcs: string[];
  findings: string[];
  rootCauses: string[];
  isPartial: boolean;
}

export interface FreezeFrameAiSample {
  sampleNumber: number;
  label: string;
  capturedAt?: string;
  source: FreezeFrameSampleSource;
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

export interface FreezeFrameAiRequestPayload {
  prompt: string;
  vehicleContext: FreezeFrameVehicleContext;
  diagnosisContext: FreezeFrameDiagnosisContext;
  samples: FreezeFrameAiSample[];
  context: {
    source: 'obd-dashboard';
    feature: 'freeze-frame-ai';
  };
}

export type FreezeFrameAiStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FreezeFrameAiState {
  status: FreezeFrameAiStatus;
  reportMarkdown: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  generatedAt: number | null;
  errorMessage: string | null;
  warnings: string[];
}

export interface FreezeFrameAiDebugSnapshot {
  generatedPrompt: string | null;
  requestPayload: FreezeFrameAiRequestPayload | null;
  rawResponse: string | null;
  errorResponse: unknown;
}

export interface FreezeFrameAiBackendResponse {
  requestId: string;
  reportMarkdown?: string;
  confidence?: 'low' | 'medium' | 'high' | string;
  warnings?: string[];
  rawResponse?: string | null;
  error?: string;
}

export interface FreezeFrameFrameSelection {
  frame: ObdLiveFrame;
  label: string;
}

export interface FreezeFrameAnalysisInput {
  state: DeepDiagnosisState;
  profile: VehicleProfile | null;
  frames: readonly ObdLiveFrame[];
  source: FreezeFrameSampleSource;
}
