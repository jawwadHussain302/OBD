import { Injectable } from '@angular/core';
import { DtcCode } from '../diagnostics/dtc/dtc-code.model';
import { OrchestrationPlan } from '../diagnostics/intelligence/diagnosis-intelligence.models';

@Injectable({ providedIn: 'root' })
export class TestOrchestratorService {

  plan(dtcCodes: DtcCode[]): OrchestrationPlan {
    if (!dtcCodes.length) {
      return { runIdleTest: true, alwaysRunRevTest: false };
    }

    const codes = new Set(dtcCodes.map(c => c.code));

    const hasCatalyst  = codes.has('P0420') || codes.has('P0430');
    const hasLean      = codes.has('P0171') || codes.has('P0174');
    const hasRich      = codes.has('P0172') || codes.has('P0175');
    const hasMisfire   = [...codes].some(c => c >= 'P0300' && c <= 'P0304');
    const hasMaf       = [...codes].some(c => c >= 'P0100' && c <= 'P0104');
    const hasNonPassive = hasLean || hasRich || hasMisfire || hasMaf;

    // Only catalyst codes → no benefit from static load tests
    if (hasCatalyst && !hasNonPassive) {
      return {
        runIdleTest: false,
        alwaysRunRevTest: false,
        skipReason: 'Only catalyst efficiency codes detected — idle and rev tests skipped. Drive cycle analysis is recommended instead.',
      };
    }

    // Misfire, lean, rich, or MAF codes → always follow through with rev test
    const alwaysRunRevTest = hasMisfire || hasLean || hasRich || hasMaf;

    return { runIdleTest: true, alwaysRunRevTest };
  }
}
