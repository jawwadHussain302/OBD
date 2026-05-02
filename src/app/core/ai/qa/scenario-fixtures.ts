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

export const ALL_SCENARIOS: AiScenario[] = [
  SCENARIO_VACUUM_LEAK,
  SCENARIO_MISFIRE,
  SCENARIO_RICH,
  SCENARIO_CATALYST,
  SCENARIO_MAF,
  SCENARIO_CLEAN,
];
