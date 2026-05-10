import { Injectable } from '@angular/core';
import { DtcCode } from '../diagnostics/dtc/dtc-code.model';
import { ObdLiveFrame } from '../models/obd-live-frame.model';
import { DiagnosisStepId } from '../diagnostics/deep-diagnosis.service';

export interface TestPlan {
  runIdleTest: boolean;
  runRevTest: boolean;
  skippedSteps: DiagnosisStepId[];
  priorityRationale: string[];
}

type DtcCategory = 'lean' | 'rich' | 'misfire' | 'maf' | 'catalyst' | 'other';

@Injectable({ providedIn: 'root' })
export class SmartTestOrchestratorService {

  buildPlan(dtcCodes: DtcCode[], baselineFrame: ObdLiveFrame | null): TestPlan {
    const categories = this.categorizeDtcs(dtcCodes);
    const rationale: string[] = [];
    const skippedSteps: DiagnosisStepId[] = [];

    // Catalyst-only: idle/rev add no diagnostic value — skip both and go to driving
    if (categories.has('catalyst') && categories.size === 1) {
      skippedSteps.push('idle_test', 'rev_test');
      rationale.push('Catalyst efficiency fault only — driving analysis is the most diagnostic next step; idle and rev tests skipped.');
      return { runIdleTest: false, runRevTest: false, skippedSteps, priorityRationale: rationale };
    }

    const runIdleTest = this.needsIdleTest(categories, baselineFrame, rationale);
    const runRevTest = this.needsRevTest(categories, rationale);

    if (!runIdleTest) skippedSteps.push('idle_test');
    if (!runRevTest) skippedSteps.push('rev_test');

    // Flag critical combinations so the UI can surface urgency
    if (categories.has('misfire') && (categories.has('lean') || categories.has('rich'))) {
      rationale.push('Critical combination: misfire with fuel fault — unburned fuel may degrade the catalytic converter. Idle test prioritized.');
    }

    return { runIdleTest, runRevTest, skippedSteps, priorityRationale: rationale };
  }

  private needsIdleTest(
    categories: Set<DtcCategory>,
    frame: ObdLiveFrame | null,
    rationale: string[]
  ): boolean {
    if (categories.has('lean') || categories.has('rich') || categories.has('misfire')) {
      rationale.push('Idle test included: fuel trim or misfire DTCs require stationary RPM/trim baseline.');
      return true;
    }
    if (frame && (Math.abs(frame.stftB1) > 8 || Math.abs(frame.ltftB1) > 8)) {
      rationale.push('Idle test included: baseline frame shows elevated fuel trims before any DTC is set.');
      return true;
    }
    if (categories.size === 0) {
      rationale.push('No DTCs detected — idle test included as standard health check.');
      return true;
    }
    // MAF or other without fuel trim anomaly: skip idle, go straight to rev or driving
    rationale.push('Idle test skipped: no fuel trim or misfire indicators present.');
    return false;
  }

  private needsRevTest(categories: Set<DtcCategory>, rationale: string[]): boolean {
    if (categories.has('lean')) {
      rationale.push('Rev test included: lean DTCs require load-differential trim comparison to distinguish vacuum leak from fuel delivery fault.');
      return true;
    }
    if (categories.has('maf')) {
      rationale.push('Rev test included: MAF fault needs RPM-differential airflow response analysis.');
      return true;
    }
    if (categories.has('misfire') && categories.has('rich')) {
      rationale.push('Rev test included: misfire with rich condition requires load-based evaluation.');
      return true;
    }
    return false;
  }

  private categorizeDtcs(dtcCodes: DtcCode[]): Set<DtcCategory> {
    const categories = new Set<DtcCategory>();
    for (const dtc of dtcCodes) {
      const code = dtc.code;
      if (code === 'P0171' || code === 'P0174')              categories.add('lean');
      else if (code === 'P0172' || code === 'P0175')         categories.add('rich');
      else if (code >= 'P0300' && code <= 'P0304')           categories.add('misfire');
      else if (code >= 'P0100' && code <= 'P0104')           categories.add('maf');
      else if (code === 'P0420' || code === 'P0430')         categories.add('catalyst');
      else                                                    categories.add('other');
    }
    return categories;
  }
}
