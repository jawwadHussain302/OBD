import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { DiagnosisSeverity, RootCauseCandidate, RepairInsightReport, RepairStep } from './diagnosis-intelligence.models';

interface CauseRepairMap {
  causeTitle: string;
  steps: Array<Omit<RepairStep, 'rationale'> & { rationale: string }>;
}

const CAUSE_REPAIRS: CauseRepairMap[] = [
  {
    causeTitle: 'Vacuum / Intake Leak',
    steps: [
      { priority: 'Immediate', system: 'Intake System', action: 'Perform intake smoke test', rationale: 'Smoke testing is the fastest way to pinpoint unmetered air ingestion points.' },
      { priority: 'Immediate', system: 'Intake System', action: 'Inspect all vacuum hoses and intake boot for cracks or loose clamps', rationale: 'Visible hose damage is a common, low-cost fix for lean idle conditions.' },
      { priority: 'Soon',      system: 'PCV System',    action: 'Check PCV valve and hose for blockage or failure', rationale: 'A stuck-open PCV valve admits unmetered air directly into the intake.' },
    ],
  },
  {
    causeTitle: 'Fuel Delivery Fault',
    steps: [
      { priority: 'Immediate', system: 'Fuel System', action: 'Test fuel pressure at idle and under load (spec typically 40–65 psi)', rationale: 'Low pressure at idle or under load directly confirms a delivery issue.' },
      { priority: 'Soon',      system: 'Fuel System', action: 'Inspect fuel pump operation — listen for prime on key-on', rationale: 'A weak or failing pump will not sustain adequate pressure.' },
      { priority: 'Soon',      system: 'Fuel System', action: 'Replace fuel filter if service interval exceeded', rationale: 'A clogged filter restricts flow and mimics a weak pump.' },
    ],
  },
  {
    causeTitle: 'Leaking or Over-fuelling Injector',
    steps: [
      { priority: 'Immediate', system: 'Fuel Injectors', action: 'Perform injector balance / contribution test with scan tool', rationale: 'Identifies which injector is over-delivering relative to others.' },
      { priority: 'Soon',      system: 'Fuel System',    action: 'Check fuel pressure regulator for diaphragm failure (fuel in vacuum line)', rationale: 'A failed regulator raises rail pressure and causes system-wide richness.' },
      { priority: 'Soon',      system: 'Fuel Injectors', action: 'Inspect injector seals and o-rings for external leaks', rationale: 'External leaks can indicate internal seat wear.' },
    ],
  },
  {
    causeTitle: 'Misfire / Ignition Fault',
    steps: [
      { priority: 'Immediate', system: 'Ignition',    action: 'Inspect and replace spark plugs if worn or fouled', rationale: 'Worn plugs are the most common misfire cause and are inexpensive to replace.' },
      { priority: 'Immediate', system: 'Ignition',    action: 'Swap ignition coil to adjacent cylinder and recheck misfire code', rationale: 'If the code follows the coil, the coil is faulty.' },
      { priority: 'Soon',      system: 'Compression', action: 'Perform compression test on affected cylinder(s)', rationale: 'Low compression indicates mechanical wear that ignition fixes cannot resolve.' },
    ],
  },
  {
    causeTitle: 'MAF Sensor Fault',
    steps: [
      { priority: 'Soon',    system: 'Air Intake',  action: 'Clean MAF sensor element with dedicated MAF cleaner spray', rationale: 'Contamination is the leading cause of MAF inaccuracy and is easily corrected.' },
      { priority: 'Soon',    system: 'Air Intake',  action: 'Inspect air filter and housing for contamination or damage', rationale: 'Debris bypassing a damaged filter can coat the MAF element.' },
      { priority: 'Routine', system: 'Sensors',     action: 'Test MAF output voltage/frequency against spec with live data', rationale: 'Confirm sensor output range before replacing the unit.' },
    ],
  },
  {
    causeTitle: 'Catalytic Converter Degradation',
    steps: [
      { priority: 'Soon',    system: 'Exhaust',  action: 'Compare upstream and downstream O2 sensor waveforms with live data', rationale: 'A functioning cat produces a steady downstream waveform; a failed one mirrors upstream switching.' },
      { priority: 'Soon',    system: 'Exhaust',  action: 'Inspect for evidence of oil or coolant burning (blue or white smoke)', rationale: 'Internal engine leaks contaminate and accelerate catalyst failure.' },
      { priority: 'Routine', system: 'Exhaust',  action: 'Check for physical damage to catalyst substrate (rattle test)', rationale: 'Impact damage breaks the substrate, blocking flow and reducing efficiency.' },
    ],
  },
];

const DTC_REPAIRS: Record<string, RepairStep[]> = {
  P0420: [
    { priority: 'Soon',    system: 'Exhaust', action: 'Inspect catalytic converter for physical damage or rattling substrate', rationale: 'Physical damage is a direct, verifiable failure mode.' },
    { priority: 'Routine', system: 'Exhaust', action: 'Compare upstream/downstream O2 sensor switching frequency', rationale: 'Confirms converter efficiency before replacement.' },
  ],
  P0430: [
    { priority: 'Soon',    system: 'Exhaust', action: 'Inspect Bank 2 catalytic converter for physical damage', rationale: 'Same efficiency threshold as P0420 but for Bank 2.' },
  ],
};

@Injectable({ providedIn: 'root' })
export class RepairInsightService {

  generate(
    rootCauses: RootCauseCandidate[],
    dtcCodes: DtcCode[],
    severity: DiagnosisSeverity,
  ): RepairInsightReport {
    const steps: RepairStep[] = [];
    const seen = new Set<string>();

    const addStep = (step: RepairStep) => {
      const key = `${step.system}:${step.action}`;
      if (!seen.has(key)) {
        seen.add(key);
        steps.push(step);
      }
    };

    for (const cause of rootCauses) {
      const map = CAUSE_REPAIRS.find(r => r.causeTitle === cause.title);
      if (map) {
        map.steps.forEach(s => addStep(s));
      }
    }

    for (const dtc of dtcCodes) {
      const dtcSteps = DTC_REPAIRS[dtc.code];
      if (dtcSteps) {
        dtcSteps.forEach(s => addStep(s));
      }
    }

    if (!steps.length && severity.level !== 'Low') {
      addStep({ priority: 'Soon', system: 'General', action: 'Perform a full vehicle health check with a professional scan tool', rationale: 'No specific root cause identified — comprehensive scan recommended.' });
    }

    const priority: Record<RepairStep['priority'], number> = { Immediate: 0, Soon: 1, Routine: 2 };
    steps.sort((a, b) => priority[a.priority] - priority[b.priority]);

    return { steps, generatedAt: Date.now() };
  }
}
