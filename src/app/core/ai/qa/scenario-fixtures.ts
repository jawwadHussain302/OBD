import { AiEvidence } from '../ai-diagnosis.models';

/** Canonical test scenario used by the evaluation checklist and debug panel. */
export interface AiScenario {
  id: string;
  label: string;
  evidence: AiEvidence;
  /** Expected primary_issue keyword(s) — at least one must appear in the AI response. */
  expectedPrimaryKeywords: string[];
  /** Expected confidence level from the AI. */
  expectedConfidence: 'High' | 'Medium' | 'Low';
  /** Hallucination tripwires — these strings must NOT appear in AI output. */
  forbiddenKeywords: string[];
}

// ── Scenario 1: Vacuum / Intake Leak (P0171 + vacuum leak pattern) ────────────
export const SCENARIO_VACUUM_LEAK: AiScenario = {
  id: 'vacuum_leak',
  label: 'Vacuum / Intake Leak — P0171 with confirmed idle pattern',
  evidence: {
    severityScore: 65,
    severityLevel: 'High',
    dtcs: [{ code: 'P0171', title: 'System Too Lean (Bank 1)', severity: 'High' }],
    primaryCause: {
      title: 'Vacuum / Intake Leak',
      confidence: 'High',
      explanation: 'Lean condition at idle that normalises under load is the classic vacuum leak signature. Inspect intake hoses, PCV valve, and manifold gaskets.',
    },
    additionalCauses: [{ title: 'Fuel Delivery Fault', confidence: 'Low' }],
    correlationFindings: ['STFT lean at idle, trims normalise at higher RPM — vacuum leak pattern identified'],
    recommendedChecks: ['Perform smoke test on intake system', 'Inspect PCV valve and hoses', 'Clean or replace MAF sensor', 'Check fuel pressure'],
    fuelTrimNote: 'STFT B1 elevated +18% at idle, drops to +4% at 2500 RPM',
    idleStabilityNote: null,
    isPartial: false,
  },
  expectedPrimaryKeywords: ['vacuum', 'intake', 'leak'],
  expectedConfidence: 'High',
  forbiddenKeywords: ['Bosch', 'Delphi', '£', '$', 'warranty'],
};

// ── Scenario 2: Random Misfire (P0300 + idle instability) ─────────────────────
export const SCENARIO_MISFIRE: AiScenario = {
  id: 'misfire',
  label: 'Random Misfire — P0300 with idle RPM instability',
  evidence: {
    severityScore: 72,
    severityLevel: 'High',
    dtcs: [{ code: 'P0300', title: 'Random/Multiple Cylinder Misfire Detected', severity: 'High' }],
    primaryCause: {
      title: 'Misfire / Ignition System Fault',
      confidence: 'High',
      explanation: 'Random multi-cylinder misfire. Could be worn spark plugs, a failing coil pack, or fuel delivery issue.',
    },
    additionalCauses: [],
    correlationFindings: ['Idle RPM instability σ = 210 RPM — rough idle pattern'],
    recommendedChecks: ['Inspect all spark plugs', 'Test ignition coil outputs', 'Check fuel pressure', 'Perform compression test'],
    fuelTrimNote: null,
    idleStabilityNote: 'Idle RPM fluctuated between 580 and 1180 RPM — variance 600 RPM',
    isPartial: false,
  },
  expectedPrimaryKeywords: ['misfire', 'ignition', 'spark'],
  expectedConfidence: 'High',
  forbiddenKeywords: ['NGK', 'Champion', '£', '$', 'P0171'],
};

// ── Scenario 3: Rich Mixture (P0172) ──────────────────────────────────────────
export const SCENARIO_RICH: AiScenario = {
  id: 'rich_mixture',
  label: 'Rich Mixture — P0172 confirmed by correlation',
  evidence: {
    severityScore: 55,
    severityLevel: 'High',
    dtcs: [{ code: 'P0172', title: 'System Too Rich (Bank 1)', severity: 'High' }],
    primaryCause: {
      title: 'Rich Fuel Mixture / Leaking Injector',
      confidence: 'High',
      explanation: 'Rich condition detected. A leaking injector, faulty fuel pressure regulator, or excess fuel delivery is likely.',
    },
    additionalCauses: [],
    correlationFindings: ['STFT and LTFT both negative across RPM range — confirmed rich condition'],
    recommendedChecks: ['Check fuel pressure regulator', 'Inspect fuel injectors for leaks', 'Verify ECT sensor reading'],
    fuelTrimNote: 'STFT B1 −14%, LTFT B1 −11% across RPM range',
    idleStabilityNote: null,
    isPartial: false,
  },
  expectedPrimaryKeywords: ['rich', 'fuel', 'injector'],
  expectedConfidence: 'High',
  forbiddenKeywords: ['P0171', 'lean', 'vacuum', '£', '$'],
};

// ── Scenario 4: Catalyst Efficiency (P0420 only) ──────────────────────────────
export const SCENARIO_CATALYST: AiScenario = {
  id: 'catalyst',
  label: 'Catalyst Efficiency — P0420 with no active fuel/misfire codes',
  evidence: {
    severityScore: 38,
    severityLevel: 'Medium',
    dtcs: [{ code: 'P0420', title: 'Catalyst System Efficiency Below Threshold (Bank 1)', severity: 'Medium' }],
    primaryCause: {
      title: 'Catalytic Converter Degradation',
      confidence: 'Medium',
      explanation: 'Catalyst efficiency below threshold. Compare O2 sensor waveforms before replacing — misfires or oil burning can trigger false P0420.',
    },
    additionalCauses: [],
    correlationFindings: [],
    recommendedChecks: ['Compare upstream/downstream O2 sensor waveforms', 'Check for oil or coolant burning', 'Inspect catalytic converter for physical damage'],
    fuelTrimNote: null,
    idleStabilityNote: null,
    isPartial: false,
  },
  expectedPrimaryKeywords: ['catalyst', 'converter', 'P0420'],
  expectedConfidence: 'Medium',
  forbiddenKeywords: ['P0171', 'lean', 'misfire', '£', '$'],
};

// ── Scenario 5: MAF Sensor Fault (P0101) ─────────────────────────────────────
export const SCENARIO_MAF: AiScenario = {
  id: 'maf_fault',
  label: 'MAF Sensor Fault — P0101 range/performance',
  evidence: {
    severityScore: 45,
    severityLevel: 'Medium',
    dtcs: [{ code: 'P0101', title: 'Mass Air Flow Sensor Range/Performance', severity: 'Medium' }],
    primaryCause: {
      title: 'MAF Sensor Fault / Intake Restriction',
      confidence: 'Medium',
      explanation: 'MAF sensor circuit or signal fault detected. Dirty element, air leaks downstream of MAF, or sensor failure.',
    },
    additionalCauses: [],
    correlationFindings: ['MAF g/s reading erratic — not scaling with RPM as expected'],
    recommendedChecks: ['Check for intake air leaks after MAF', 'Clean MAF sensor', 'Test MAF output with scan tool'],
    fuelTrimNote: 'STFT B1 +8% — compensating for inaccurate airflow reading',
    idleStabilityNote: null,
    isPartial: false,
  },
  expectedPrimaryKeywords: ['MAF', 'airflow', 'mass air', 'sensor'],
  expectedConfidence: 'Medium',
  forbiddenKeywords: ['P0420', 'catalyst', '£', '$'],
};

// ── Scenario 6: Clean Diagnosis (no DTCs) ─────────────────────────────────────
export const SCENARIO_CLEAN: AiScenario = {
  id: 'clean',
  label: 'Clean Diagnosis — no fault codes, no significant findings',
  evidence: {
    severityScore: 0,
    severityLevel: 'Low',
    dtcs: [],
    primaryCause: null,
    additionalCauses: [],
    correlationFindings: [],
    recommendedChecks: [],
    fuelTrimNote: null,
    idleStabilityNote: null,
    isPartial: false,
  },
  expectedPrimaryKeywords: ['no fault', 'normal', 'clear', 'healthy', 'no issue'],
  expectedConfidence: 'Low',
  forbiddenKeywords: ['P0171', 'P0300', 'misfire', 'lean', 'rich'],
};


// ── Scenario 7: Evap System Leak (P0456) ──────────────────────────────────────
export const SCENARIO_EVAP_LEAK: AiScenario = {
  id: 'evap_leak',
  label: 'Evap System Leak — P0456 minor leak detected',
  evidence: {
    severityScore: 25,
    severityLevel: 'Low',
    dtcs: [{ code: 'P0456', title: 'EVAP System Leak Detected (very small leak)', severity: 'Low' }],
    primaryCause: {
      title: 'Evaporative Emission System Leak',
      confidence: 'Medium',
      explanation: 'A very small leak in the EVAP system. Often caused by a loose or faulty gas cap, a cracked EVAP hose, or a failing purge valve.',
    },
    additionalCauses: [],
    correlationFindings: ['EVAP monitor incomplete or failed during drive cycle'],
    recommendedChecks: ['Check and tighten gas cap', 'Inspect EVAP hoses for cracks', 'Perform smoke test on EVAP system'],
    fuelTrimNote: null,
    idleStabilityNote: null,
    isPartial: false,
  },
  expectedPrimaryKeywords: ['evap', 'evaporative', 'leak', 'gas cap'],
  expectedConfidence: 'Medium',
  forbiddenKeywords: ['misfire', 'catalyst', '£', '$'],
};

// ── Scenario 8: Oxygen Sensor Stuck Lean (P0134) ─────────────────────────────
export const SCENARIO_O2_SENSOR: AiScenario = {
  id: 'o2_sensor',
  label: 'Oxygen Sensor No Activity — P0134',
  evidence: {
    severityScore: 40,
    severityLevel: 'Medium',
    dtcs: [{ code: 'P0134', title: 'O2 Sensor Circuit No Activity Detected (Bank 1 Sensor 1)', severity: 'Medium' }],
    primaryCause: {
      title: 'Upstream Oxygen Sensor Failure',
      confidence: 'High',
      explanation: 'The primary oxygen sensor is not responding. This affects fuel trim calculations and can cause poor fuel economy or rough running.',
    },
    additionalCauses: [{ title: 'Wiring/Connector Issue', confidence: 'Medium' }],
    correlationFindings: ['O2S11 voltage stuck at 0.45V during warm-up and rev tests'],
    recommendedChecks: ['Check O2 sensor wiring and connector', 'Test O2 sensor heater circuit', 'Replace upstream O2 sensor'],
    fuelTrimNote: 'Fuel trims fixed in open-loop default values',
    idleStabilityNote: null,
    isPartial: false,
  },
  expectedPrimaryKeywords: ['oxygen', 'o2 sensor', 'sensor', 'activity'],
  expectedConfidence: 'High',
  forbiddenKeywords: ['P0171', 'misfire', 'MAF', '£', '$'],
};

// ── Scenario 9: Coolant Temperature Sensor (P0118) ───────────────────────────
export const SCENARIO_ECT: AiScenario = {
  id: 'ect_sensor',
  label: 'Coolant Temp Sensor High — P0118',
  evidence: {
    severityScore: 50,
    severityLevel: 'Medium',
    dtcs: [{ code: 'P0118', title: 'Engine Coolant Temperature Sensor 1 Circuit High', severity: 'High' }],
    primaryCause: {
      title: 'ECT Sensor Fault / Open Circuit',
      confidence: 'High',
      explanation: 'The engine coolant temperature sensor is reading -40 degrees, indicating an open circuit or unplugged sensor. The engine will run very rich.',
    },
    additionalCauses: [],
    correlationFindings: ['Coolant temp stuck at -40C despite engine running for 10 mins'],
    recommendedChecks: ['Inspect ECT sensor connector', 'Check ECT wiring for open circuit', 'Replace ECT sensor'],
    fuelTrimNote: 'Engine operating in rich warm-up mode constantly',
    idleStabilityNote: 'Idle elevated (1100 RPM) due to cold enrichment strategy',
    isPartial: false,
  },
  expectedPrimaryKeywords: ['coolant', 'temperature', 'ect', 'sensor'],
  expectedConfidence: 'High',
  forbiddenKeywords: ['vacuum', 'catalyst', '£', '$'],
};

// ── Scenario 10: Partial Data (Missing PIDs) ──────────────────────────────────
export const SCENARIO_PARTIAL_DATA: AiScenario = {
  id: 'partial_data',
  label: 'Partial Data — Diagnosis aborted early',
  evidence: {
    severityScore: 10,
    severityLevel: 'Low',
    dtcs: [],
    primaryCause: null,
    additionalCauses: [],
    correlationFindings: [],
    recommendedChecks: ['Complete full diagnostic test cycle'],
    fuelTrimNote: null,
    idleStabilityNote: null,
    isPartial: true,
  },
  expectedPrimaryKeywords: ['partial', 'incomplete', 'more data', 'no fault', 'clear'],
  expectedConfidence: 'Low',
  forbiddenKeywords: ['misfire', 'leak', 'rich', '£', '$'],
};

// ── Scenario 11: Throttle Position Sensor (P0122) ────────────────────────────
export const SCENARIO_TPS: AiScenario = {
  id: 'tps_fault',
  label: 'Throttle Position Sensor Low — P0122',
  evidence: {
    severityScore: 60,
    severityLevel: 'High',
    dtcs: [{ code: 'P0122', title: 'Throttle/Pedal Position Sensor A Circuit Low', severity: 'High' }],
    primaryCause: {
      title: 'TPS Sensor Fault',
      confidence: 'High',
      explanation: 'Throttle position sensor voltage is too low, often caused by a short to ground or a failing sensor track. Can cause hesitation or stalling.',
    },
    additionalCauses: [],
    correlationFindings: ['TPS reading 0% even when RPM increases during rev test'],
    recommendedChecks: ['Check TPS wiring harness for shorts to ground', 'Test TPS signal voltage sweep', 'Replace throttle position sensor'],
    fuelTrimNote: null,
    idleStabilityNote: 'Engine stumbled during attempted rev test',
    isPartial: false,
  },
  expectedPrimaryKeywords: ['throttle', 'position', 'tps', 'sensor'],
  expectedConfidence: 'High',
  forbiddenKeywords: ['evap', 'coolant', '£', '$'],
};

// ── Scenario 12: No DTC Abnormal Behavior (Stalling/Rough Idle) ───────────────
export const SCENARIO_NO_DTC_ROUGH: AiScenario = {
  id: 'no_dtc_rough',
  label: 'No DTCs but Rough Idle Detected',
  evidence: {
    severityScore: 45,
    severityLevel: 'Medium',
    dtcs: [],
    primaryCause: {
      title: 'Unmetered Air or Idle Control Issue',
      confidence: 'Medium',
      explanation: 'No fault codes are present, but the engine idle is unstable. This could be an early sign of a vacuum leak, dirty throttle body, or failing idle air control valve.',
    },
    additionalCauses: [{ title: 'Dirty Throttle Body', confidence: 'Medium' }],
    correlationFindings: ['Idle RPM fluctuating heavily without setting misfire codes'],
    recommendedChecks: ['Clean throttle body and idle air control valve', 'Check for small vacuum leaks', 'Perform idle relearn procedure'],
    fuelTrimNote: 'STFT fluctuating normally, no rich/lean condition confirmed',
    idleStabilityNote: 'Idle RPM varied between 600 and 950 RPM',
    isPartial: false,
  },
  expectedPrimaryKeywords: ['idle', 'throttle', 'air', 'unstable'],
  expectedConfidence: 'Medium',
  forbiddenKeywords: ['P0', '£', '$'],
};

export const ALL_SCENARIOS: AiScenario[] = [
  SCENARIO_VACUUM_LEAK,
  SCENARIO_MISFIRE,
  SCENARIO_RICH,
  SCENARIO_CATALYST,
  SCENARIO_MAF,
  SCENARIO_CLEAN,
  SCENARIO_EVAP_LEAK,
  SCENARIO_O2_SENSOR,
  SCENARIO_ECT,
  SCENARIO_PARTIAL_DATA,
  SCENARIO_TPS,
  SCENARIO_NO_DTC_ROUGH,
];
