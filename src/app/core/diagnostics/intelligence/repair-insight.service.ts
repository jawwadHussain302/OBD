import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { DiagnosisSeverity, RepairInsight, RootCauseCandidate } from './diagnosis-intelligence.models';

@Injectable({ providedIn: 'root' })
export class RepairInsightService {

  generate(
    dtcCodes: DtcCode[],
    rootCauses: RootCauseCandidate[],
    severity: DiagnosisSeverity
  ): RepairInsight[] {
    const codes = new Set(dtcCodes.map(c => c.code));
    const isUrgent = severity.level === 'High' || severity.level === 'Critical';
    const insights: RepairInsight[] = [];

    for (const cause of rootCauses) {
      if (cause.title.includes('Vacuum') || cause.title.includes('Intake Leak')) {
        insights.push({
          category: 'Intake System',
          title: 'Locate and Seal Vacuum Leak',
          steps: [
            { stepNumber: 1, action: 'Visually inspect all vacuum hoses and intake ducting for cracks or loose clamps' },
            { stepNumber: 2, action: 'Perform smoke test on intake manifold with engine running', toolRequired: 'Smoke machine' },
            { stepNumber: 3, action: 'Check PCV valve and breather hose for deterioration — replace if collapsed or cracked' },
            { stepNumber: 4, action: 'Inspect intake manifold gaskets at cylinder head mating surface for leaks' },
            { stepNumber: 5, action: 'Clear DTCs after repair and verify STFT returns to ±5% at idle', toolRequired: 'OBD scan tool' },
          ],
          estimatedTime: '1–3 hours',
          difficulty: 'Moderate',
          urgency: isUrgent ? 'Urgent' : 'Soon',
        });
      }

      if (cause.title.includes('Fuel Delivery')) {
        insights.push({
          category: 'Fuel System',
          title: 'Inspect Fuel Delivery System',
          steps: [
            { stepNumber: 1, action: 'Measure fuel rail pressure at idle — spec is typically 40–60 psi', toolRequired: 'Fuel pressure gauge' },
            { stepNumber: 2, action: 'Check pressure hold after engine off — should hold >30 psi for 5 minutes (rules out leaking injector or regulator)' },
            { stepNumber: 3, action: 'Inspect fuel filter for restriction — replace if mileage exceeds service interval' },
            { stepNumber: 4, action: 'Test fuel pump current draw — high current indicates a failing pump', toolRequired: 'Clamp ammeter' },
          ],
          estimatedTime: '1–2 hours',
          difficulty: 'Moderate',
          urgency: isUrgent ? 'Urgent' : 'Soon',
        });
      }

      if (cause.title.includes('Rich') || cause.title.includes('Leaking Injector')) {
        insights.push({
          category: 'Fuel System',
          title: 'Diagnose Rich Fuel Condition',
          steps: [
            { stepNumber: 1, action: 'Check fuel pressure regulator — remove vacuum line, fuel should not drip from port' },
            { stepNumber: 2, action: 'Perform injector leak-down test with fuel pump running and ignition off', toolRequired: 'Injector tester' },
            { stepNumber: 3, action: 'Monitor LTFT and STFT after extended idle — negative values confirm rich condition' },
            { stepNumber: 4, action: 'Check for engine oil with petrol smell — a sign of injectors flooding cylinders' },
            { stepNumber: 5, action: 'Verify coolant temp sensor reading is accurate — faulty ECT causes rich running when cold', toolRequired: 'Multimeter' },
          ],
          estimatedTime: '1–2 hours',
          difficulty: 'Moderate',
          urgency: 'Soon',
        });
      }

      if (cause.title.includes('Misfire')) {
        insights.push({
          category: 'Ignition System',
          title: 'Diagnose and Repair Misfire',
          steps: [
            { stepNumber: 1, action: 'Inspect all spark plugs for wear, fouling, or incorrect gap', toolRequired: 'Spark plug socket, feeler gauge' },
            { stepNumber: 2, action: 'Swap ignition coil from suspect cylinder to a known-good cylinder and retest — if misfire follows coil, replace coil' },
            { stepNumber: 3, action: 'Perform cylinder compression test — low compression indicates mechanical fault', toolRequired: 'Compression tester' },
            { stepNumber: 4, action: 'Check injector pulse on misfiring cylinder using noid light', toolRequired: 'Noid light' },
            { stepNumber: 5, action: 'Inspect for vacuum leaks at intake manifold on suspect cylinder' },
          ],
          estimatedTime: '2–4 hours',
          difficulty: 'Moderate',
          urgency: severity.level === 'Critical' ? 'Critical' : 'Urgent',
        });
      }

      if (cause.title.includes('MAF')) {
        insights.push({
          category: 'Air Intake / Sensors',
          title: 'Clean or Replace MAF Sensor',
          steps: [
            { stepNumber: 1, action: 'Remove MAF sensor from air intake pipe' },
            { stepNumber: 2, action: 'Spray sensing element with MAF-safe cleaner — do NOT touch the wire element', toolRequired: 'MAF sensor cleaner spray' },
            { stepNumber: 3, action: 'Reinstall and verify live MAF readings: ~2–3 g/s at idle, scales with RPM', toolRequired: 'OBD scan tool' },
            { stepNumber: 4, action: 'If readings remain erratic or out-of-range, replace MAF sensor' },
            { stepNumber: 5, action: 'Inspect air filter and intake duct for holes, blockages, or post-MAF leaks' },
          ],
          estimatedTime: '30–60 minutes',
          difficulty: 'Easy',
          urgency: 'Soon',
        });
      }

      if (cause.title.includes('Catalytic')) {
        insights.push({
          category: 'Exhaust System',
          title: 'Verify Catalyst Efficiency Before Replacement',
          steps: [
            { stepNumber: 1, action: 'Compare upstream vs downstream O2 sensor waveforms — downstream should be stable if catalyst is functioning', toolRequired: 'OBD scan tool' },
            { stepNumber: 2, action: 'Check for oil or coolant burning — catalyst poisoning is a common cause of premature failure' },
            { stepNumber: 3, action: 'Inspect catalyst for physical damage, rattle noise, or substrate meltdown (tap test)' },
            { stepNumber: 4, action: 'If upstream and downstream waveforms mirror each other, replace catalytic converter' },
            { stepNumber: 5, action: 'Resolve any misfire or rich condition first — running a damaged engine will destroy a new catalyst' },
          ],
          estimatedTime: '1–2 hours diagnosis; replacement 2–4 hours',
          difficulty: 'Professional',
          urgency: 'Monitor',
        });
      }
    }

    // Fallback when no root cause matches a specific repair template
    if (!insights.length && dtcCodes.length) {
      insights.push({
        category: 'General',
        title: 'Professional Diagnostic Scan Recommended',
        steps: [
          { stepNumber: 1, action: 'Perform full bi-directional scan to check all modules and freeze-frame data', toolRequired: 'Advanced scan tool' },
          { stepNumber: 2, action: 'Review manufacturer service information for each stored DTC' },
          { stepNumber: 3, action: 'Monitor live data during a road test to replicate fault conditions' },
        ],
        estimatedTime: '1–2 hours',
        difficulty: 'Professional',
        urgency: severity.level === 'Critical' ? 'Critical' : severity.level === 'High' ? 'Urgent' : 'Soon',
      });
    }

    return insights;
  }
}
