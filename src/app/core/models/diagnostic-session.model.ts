import { VehicleProfile } from './vehicle-profile.model';
import { ObdLiveFrame } from './obd-live-frame.model';
import { DiagnosticResult } from './diagnostic-result.model';
import { GuidedTestResult } from './guided-test.model';

export interface DiagnosticSession {
  sessionId: string;
  vehicleProfileId: string;
  vehicleSnapshot: VehicleProfile;
  startedAt: number;
  endedAt?: number;
  frames: ObdLiveFrame[];
  diagnosticResults: DiagnosticResult[];
  guidedTestResults?: GuidedTestResult[];
}
