import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosticResult } from '../models/diagnostic-result.model';

/**
 * Interface for a single diagnostic rule.
 * Rules process live frames and return a result if an issue is detected.
 */
export interface DiagnosticRule {
  /** 
   * Unique identifier for the rule.
   */
  readonly id: string;

  /**
   * Evaluates a set of frames against the rule logic.
   * @returns DiagnosticResult if issue detected, null otherwise.
   */
  evaluate(allFrames: ObdLiveFrame[], recentFrames: ObdLiveFrame[]): DiagnosticResult | null;
}
