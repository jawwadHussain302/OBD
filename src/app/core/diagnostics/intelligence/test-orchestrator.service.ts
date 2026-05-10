import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { TestOrchestrationPlan } from './diagnosis-intelligence.models';
import { DiagnosisStepId } from '../deep-diagnosis.service';

@Injectable({ providedIn: 'root' })
export class TestOrchestratorService {

  plan(dtcCodes: DtcCode[]): TestOrchestrationPlan {
    if (!dtcCodes.length) {
      return {
        skipSteps: [],
        focusArea: 'general',
        priorityReason: 'No fault codes detected — running full test sequence.',
      };
    }

    const codes = new Set(dtcCodes.map(c => c.code));
    const hasMisfire = dtcCodes.some(c => /^P030[0-9]$/.test(c.code));
    const hasLean    = codes.has('P0171') || codes.has('P0174');
    const hasRich    = codes.has('P0172') || codes.has('P0175');
    const hasMaf     = dtcCodes.some(c => /^P010[0-4]$/.test(c.code));
    const hasCatalyst = codes.has('P0420') || codes.has('P0430');

    // Misfire codes → full sequence needed to characterise load behaviour
    if (hasMisfire) {
      return {
        skipSteps: [],
        focusArea: 'misfire',
        priorityReason: 'Misfire code detected — full idle + rev + driving sequence required to characterise fault under load.',
      };
    }

    // Lean / rich fuel codes → idle & rev tests provide all needed trim data
    if (hasLean || hasRich) {
      const skipSteps: DiagnosisStepId[] = ['driving_prompt'];
      return {
        skipSteps,
        focusArea: 'fuel-trim',
        priorityReason: `Fuel trim code${hasLean ? ' (lean)' : ''}${hasRich ? ' (rich)' : ''} detected — idle and rev tests capture key STFT/LTFT data. Road test skipped.`,
      };
    }

    // MAF codes → idle + rev comparison sufficient
    if (hasMaf) {
      const skipSteps: DiagnosisStepId[] = ['driving_prompt'];
      return {
        skipSteps,
        focusArea: 'maf',
        priorityReason: 'MAF sensor code detected — idle and rev tests provide MAF g/s comparison data. Road test skipped.',
      };
    }

    // Catalyst only → extended idle is most diagnostic
    if (hasCatalyst) {
      const skipSteps: DiagnosisStepId[] = ['driving_prompt'];
      return {
        skipSteps,
        focusArea: 'idle',
        priorityReason: 'Catalyst efficiency code detected — extended idle test is most diagnostic. Road test not required.',
      };
    }

    // Mixed or unrecognised codes → run everything
    return {
      skipSteps: [],
      focusArea: 'general',
      priorityReason: 'Mixed or unrecognised fault codes — running full test sequence for complete diagnosis.',
    };
  }
}
