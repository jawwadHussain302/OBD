import { Injectable } from '@angular/core';
import { DtcCode } from '../dtc/dtc-code.model';
import { CorrelationFinding, DiagnosisRecommendation, DiagnosisSeverity } from './diagnosis-intelligence.models';

const CODE_CHECKS: Record<string, string[]> = {
  P0171: ['Perform smoke test on intake system', 'Inspect PCV valve and hoses', 'Clean or replace MAF sensor', 'Check fuel pressure'],
  P0174: ['Perform smoke test on intake system (Bank 2)', 'Inspect PCV valve and hoses', 'Check fuel pressure'],
  P0172: ['Check fuel pressure regulator', 'Inspect fuel injectors for leaks', 'Verify ECT sensor reading'],
  P0175: ['Check fuel pressure regulator (Bank 2)', 'Inspect fuel injectors for leaks'],
  P0300: ['Inspect all spark plugs', 'Test ignition coil outputs', 'Check fuel pressure', 'Perform compression test'],
  P0301: ['Swap coil from cyl 1 and retest', 'Check spark plug on cyl 1', 'Perform compression test on cyl 1'],
  P0302: ['Swap coil from cyl 2 and retest', 'Check spark plug on cyl 2', 'Perform compression test on cyl 2'],
  P0303: ['Swap coil from cyl 3 and retest', 'Check spark plug on cyl 3', 'Perform compression test on cyl 3'],
  P0304: ['Swap coil from cyl 4 and retest', 'Check spark plug on cyl 4', 'Perform compression test on cyl 4'],
  P0100: ['Inspect MAF sensor wiring and connector', 'Clean MAF sensor element', 'Check air filter'],
  P0101: ['Check for intake air leaks after MAF', 'Clean MAF sensor', 'Test MAF output with scan tool'],
  P0102: ['Check MAF wiring for open circuit', 'Test MAF sensor ground', 'Replace MAF sensor if faulty'],
  P0103: ['Inspect MAF wiring for short to voltage', 'Replace MAF sensor if faulty'],
  P0104: ['Wiggle-test MAF wiring while monitoring live data', 'Inspect connector pins'],
  P0420: ['Compare upstream/downstream O2 sensor waveforms', 'Check for oil or coolant burning', 'Inspect catalytic converter for physical damage'],
  P0430: ['Compare upstream/downstream O2 sensor waveforms (Bank 2)', 'Inspect catalytic converter for physical damage'],
};

const SEVERITY_NEXT_STEPS: Record<DiagnosisSeverity['level'], string[]> = {
  Low:      ['Monitor vehicle behaviour', 'Schedule routine service appointment'],
  Medium:   ['Address faults within 1–2 weeks to prevent worsening', 'Consider professional scan before next long drive'],
  High:     ['Address faults soon — continued driving may cause further damage', 'Professional diagnosis recommended'],
  Critical: ['Do not drive until fault is diagnosed', 'Seek immediate professional inspection'],
};

@Injectable({ providedIn: 'root' })
export class DiagnosticRecommendationService {

  recommend(
    dtcCodes: DtcCode[],
    findings: CorrelationFinding[],
    level: DiagnosisSeverity['level']
  ): DiagnosisRecommendation {
    const checksSet = new Set<string>();

    for (const dtc of dtcCodes) {
      const checks = CODE_CHECKS[dtc.code] ?? dtc.recommendedChecks ?? [];
      checks.forEach(c => checksSet.add(c));
    }

    if (!dtcCodes.length && findings.length) {
      checksSet.add('Review correlation findings and perform targeted sensor checks');
    }

    if (!checksSet.size) {
      checksSet.add('Perform full vehicle health check');
    }

    return {
      recommendedChecks: [...checksSet],
      nextSteps: SEVERITY_NEXT_STEPS[level],
    };
  }
}
