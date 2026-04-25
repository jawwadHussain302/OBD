import { VehicleProfile } from './vehicle-profile.model';
import { ObdLiveFrame } from './obd-live-frame.model';
import { DiagnosticResult } from './diagnostic-result.model';

/**
 * Represents a recorded diagnostic session containing vehicle info, data frames, and detected issues.
 */
export interface DiagnosticSession {
  sessionId: string;
  vehicleProfileId: string;
  vehicleSnapshot: VehicleProfile;
  startedAt: number;
  endedAt?: number;
  frames: ObdLiveFrame[];
  diagnosticResults: DiagnosticResult[];
}
