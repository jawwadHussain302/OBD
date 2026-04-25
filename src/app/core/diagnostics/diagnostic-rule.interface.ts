import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';

export interface DiagnosticRule {
  id: string;
  evaluate(frames: ObdLiveFrame[], sessionDurationMs: number): DiagnosticResult | null;
}
