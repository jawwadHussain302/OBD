import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { DiagnosisSeverity, RepairInsightReport, RepairStep, RootCauseCandidate } from './diagnosis-intelligence.models';

interface CauseRepairMap {
  causeTitle: string;
  steps: RepairStep[];
}

const CAUSE_REPAIRS: CauseRepairMap[] = [
  {
    causeTitle: 'Vacuum / Intake Leak',
    steps: [
      { priority: 'Immediate', system: 'Intake System', action: 'Perform intake smoke test with engine running', rationale: 'Smoke testing is the fastest way to pinpoint unmetered air ingestion points.' },
      { priority: 'Immediate', system: 'Intake System', action: 'Inspect all vacuum hoses and intake boot for cracks or loose clamps', rationale: 'Visible hose damage is a common, low-cost fix for lean idle conditions.' },
      { priority: 'Soon',      system: 'PCV System',    action: 'Check PCV valve and breather hose for blockage or deterioration', rationale: 'A stuck-open PCV valve admits unmetered air directly into the intake.' },
      { priority: 'Soon',      system: 'Intake System', action: 'Inspect intake manifold gaskets at cylinder head mating surface', rationale: 'Gasket leaks are a common source of vacuum leaks on higher-mileage engines.' },
      { priority: 'Routine',   system: 'Fuel Trims',    action: 'Clear DTCs and verify STFT returns to ±5% at idle after repair', rationale: 'Confirms the leak source has been fully sealed.' },
    ],
  },
  {
    causeTitle: 'Fuel Delivery Fault',
    steps: [
      { priority: 'Immediate', system: 'Fuel System', action: 'Measure fuel pressure at rail at idle and under snap throttle — spec typically 40–65 psi', rationale: 'Low pressure at idle or under load directly confirms a delivery issue.' },
      { priority: 'Immediate', system: 'Fuel System', action: 'Check fuel pressure hold after engine off — should hold >30 psi for 5 minutes', rationale: 'Rapid pressure drop indicates a leaking injector or failed check valve.' },
      { priority: 'Soon',      system: 'Fuel System', action: 'Inspect fuel pump prime — listen for pump hum on key-on', rationale: 'A weak or failing pump will not sustain adequate pressure.' },
      { priority: 'Soon',      system: 'Fuel System', action: 'Replace fuel filter if mileage exceeds service interval', rationale: 'A clogged filter restricts flow and mimics a weak pump.' },
    ],
  },
  {
    causeTitle: 'Rich Fuel Mixture',
    steps: [
      { priority: 'Immediate', system: 'Fuel Injectors', action: 'Perform injector balance / contribution test with scan tool', rationale: 'Identifies which injector is over-delivering relative to others.' },
      { priority: 'Soon',      system: 'Fuel System',    action: 'Check fuel pressure regulator vacuum port — fuel should not drip from port', rationale: 'A failed diaphragm raises rail pressure causing system-wide richness.' },
      { priority: 'Soon',      system: 'Fuel Injectors', action: 'Inspect injector o-rings and seals for external leaks', rationale: 'External leaks can indicate internal seat wear.' },
      { priority: 'Routine',   system: 'Sensors',        action: 'Verify coolant temperature sensor reading matches actual engine temp', rationale: 'A faulty ECT reporting cold causes extended rich enrichment.' },
    ],
  },
  {
    causeTitle: 'Misfire',
    steps: [
      { priority: 'Immediate', system: 'Ignition',    action: 'Inspect and replace spark plugs if worn, fouled, or incorrectly gapped', rationale: 'Worn plugs are the most common misfire cause and are inexpensive to replace.' },
      { priority: 'Immediate', system: 'Ignition',    action: 'Swap ignition coil to an adjacent cylinder and recheck misfire code', rationale: 'If the misfire code follows the coil, the coil is faulty.' },
      { priority: 'Soon',      system: 'Compression', action: 'Perform compression test on affected cylinder(s)', rationale: 'Low compression indicates mechanical wear that ignition fixes cannot resolve.' },
      { priority: 'Soon',      system: 'Fuel System', action: 'Verify injector pulse on misfiring cylinder using noid light', rationale: 'No pulse points to a wiring or ECU issue, not an ignition fault.' },
    ],
  },
  {
    causeTitle: 'MAF Sensor',
    steps: [
      { priority: 'Immediate', system: 'Air Intake', action: 'Clean MAF sensor element with dedicated MAF cleaner spray — do not touch element', rationale: 'Contamination is the leading cause of MAF inaccuracy and is easily corrected.' },
      { priority: 'Soon',      system: 'Air Intake', action: 'Inspect air filter and housing for contamination, holes, or debris', rationale: 'Debris bypassing a damaged filter can coat the MAF element.' },
      { priority: 'Soon',      system: 'Sensors',    action: 'Monitor MAF g/s live: should read ~2–3 g/s at idle, scaling linearly with RPM', rationale: 'Flat or erratic MAF output confirms sensor failure; replace if readings out of spec.' },
    ],
  },
  {
    causeTitle: 'Catalytic Converter',
    steps: [
      { priority: 'Soon',    system: 'Exhaust', action: 'Compare upstream and downstream O2 sensor waveforms with live data', rationale: 'A functioning cat produces a stable downstream waveform; a failed one mirrors upstream switching.' },
      { priority: 'Soon',    system: 'Exhaust', action: 'Check for evidence of oil or coolant burning (blue or white exhaust smoke)', rationale: 'Internal engine leaks contaminate and accelerate catalyst failure.' },
      { priority: 'Routine', system: 'Exhaust', action: 'Inspect catalyst for physical damage — tap test for loose substrate', rationale: 'Impact damage breaks the substrate and reduces efficiency irreversibly.' },
      { priority: 'Routine', system: 'Exhaust', action: 'Resolve any active misfire or rich condition before fitting a new catalyst', rationale: 'Unburned fuel from misfires will rapidly destroy a replacement converter.' },
    ],
  },
];

const DTC_STEPS: Record<string, RepairStep[]> = {
  P0420: [{ priority: 'Soon', system: 'Exhaust', action: 'Inspect Bank 1 catalytic converter for damage or rattling substrate', rationale: 'Physical damage is a direct, verifiable failure mode.' }],
  P0430: [{ priority: 'Soon', system: 'Exhaust', action: 'Inspect Bank 2 catalytic converter for damage or rattling substrate', rationale: 'Same efficiency threshold as P0420 but for Bank 2.' }],
};

const PRIORITY_ORDER: Record<RepairStep['priority'], number> = { Immediate: 0, Soon: 1, Routine: 2 };

@Injectable({ providedIn: 'root' })
export class RepairInsightService {

  generate(
    dtcCodes: DtcCode[],
    rootCauses: RootCauseCandidate[],
    severity: DiagnosisSeverity
  ): RepairInsightReport {
    const steps: RepairStep[] = [];
    const addedTitles = new Set<string>();

    for (const cause of rootCauses) {
      const template = CAUSE_REPAIRS.find(r => cause.title.includes(r.causeTitle));
      if (template && !addedTitles.has(template.causeTitle)) {
        steps.push(...template.steps);
        addedTitles.add(template.causeTitle);
      }
    }

    for (const dtc of dtcCodes) {
      const dtcSteps = DTC_STEPS[dtc.code];
      if (dtcSteps) steps.push(...dtcSteps);
    }

    if (!steps.length && dtcCodes.length) {
      steps.push(
        { priority: 'Soon',    system: 'General', action: 'Perform full bi-directional scan to check all modules and freeze-frame data', rationale: 'Freeze-frame captures the conditions when the fault was set.' },
        { priority: 'Routine', system: 'General', action: 'Review manufacturer service information for each stored DTC', rationale: 'OEM procedures include component-specific test sequences.' },
      );
    }

    steps.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return { steps, generatedAt: Date.now() };
  }
}
