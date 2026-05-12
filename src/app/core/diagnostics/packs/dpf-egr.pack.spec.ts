import { TestBed } from '@angular/core/testing';
import { DiagnosticEngineService } from '../diagnostic-engine.service';
import { DiagnosticState } from '../diagnostic-types';
import { dpfEgrPack } from './dpf-egr.pack';

/**
 * DPF / EGR Pack — scenario walkthroughs
 *
 * Score constants (initial: 0.25 each, additive):
 *   HEAVY=0.40  STRONG=0.35  MEDIUM=0.20  SLIGHT=0.15  REDUCE=-0.20
 */

function topHypothesis(state: DiagnosticState): string {
  return Object.entries(state.hypothesisScores)
    .sort(([, a], [, b]) => b - a)[0][0];
}

describe('dpfEgrPack', () => {
  let engine: DiagnosticEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    engine = TestBed.inject(DiagnosticEngineService);
  });

  // ── Scenario A: DPF soot overload + regeneration failure ────────────────
  // DPF warning light / limp mode, P2002 code, soot load > 75 %,
  // high differential pressure, EGR and temp sensors fine,
  // forced regen refused by scan tool. Expected winner: dpf_soot_overload_issue.
  it('Scenario A — DPF soot overload: dpf_soot_overload_issue wins', () => {
    engine.startPack(dpfEgrPack);

    // symptom_confirm — DPF warning / limp mode  → dpf_soot +STRONG, regen_fail +MEDIUM
    let step = engine.getCurrentStep()!;
    expect(step.id).toBe('symptom_confirm');
    engine.applyAnswer(step.options[0]);

    // dtc_check — P2002 / P2003  → dpf_soot +HEAVY
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('dtc_check');
    engine.applyAnswer(step.options[0]);

    // soot_load_regen_history — soot > 75 %  → dpf_soot +HEAVY, regen_fail +STRONG
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('soot_load_regen_history');
    engine.applyAnswer(step.options[2]);

    // differential_pressure — elevated, rises with RPM  → dpf_soot +STRONG, turbo +MEDIUM
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('differential_pressure');
    engine.applyAnswer(step.options[1]);

    // egr_valve_operation — tracks correctly  → egr -REDUCE
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('egr_valve_operation');
    engine.applyAnswer(step.options[0]);

    // exhaust_temp_sensor — plausible  → temp_sensor -REDUCE
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('exhaust_temp_sensor');
    engine.applyAnswer(step.options[0]);

    // forced_regen_assessment — scan tool refused (soot too high)  → dpf_soot +HEAVY, regen_fail +STRONG
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('forced_regen_assessment');
    engine.applyAnswer(step.options[2]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(7);

    // dpf_soot = 0.25 + 0.35 + 0.40 + 0.40 + 0.35 + 0.40 = 2.15
    expect(topHypothesis(state)).toBe('dpf_soot_overload_issue');
    expect(state.hypothesisScores['dpf_soot_overload_issue']).toBeCloseTo(2.15, 5);
  });

  // ── Scenario B: Differential pressure sensor fault ───────────────────────
  // DPF light on, P2453 code, soot load reads low (sensor can't be trusted),
  // zero differential pressure at all RPM, EGR fine, temp sensors fine,
  // forced regen aborts (ECU thinks DPF is full because sensor is faulty).
  // Expected winner: differential_pressure_sensor_issue.
  it('Scenario B — differential pressure sensor fault: sensor issue wins', () => {
    engine.startPack(dpfEgrPack);

    // symptom_confirm — frequent regen cycles  → regen_fail +STRONG, dpf_soot +SLIGHT
    let step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // dtc_check — P2452/P2453/P2454  → diff_pressure_sensor +HEAVY, dpf_soot +SLIGHT
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // soot_load_regen_history — data not available
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[3]);

    // differential_pressure — zero/flat at all RPM  → diff_sensor +HEAVY, dpf_soot +SLIGHT
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    // egr_valve_operation — tracks correctly  → egr -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // exhaust_temp_sensor — plausible  → temp_sensor -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // forced_regen_assessment — aborted before completion  → regen_fail +HEAVY, temp_sensor +MEDIUM
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');

    // diff_pressure_sensor = 0.25 + 0.40 + 0.40 = 1.05
    expect(topHypothesis(state)).toBe('differential_pressure_sensor_issue');
    expect(state.hypothesisScores['differential_pressure_sensor_issue']).toBeCloseTo(1.05, 5);
  });

  // ── Scenario C: EGR valve stuck open ────────────────────────────────────
  // Black smoke, rough idle. P0401 code. Soot load moderate.
  // Pressure normal. EGR actual position stuck high at idle.
  // Temp sensors plausible. Forced regen completes (DPF itself is fine).
  // Expected winner: egr_valve_issue.
  it('Scenario C — EGR valve stuck open: egr_valve_issue wins', () => {
    engine.startPack(dpfEgrPack);

    // symptom_confirm — black smoke / rough idle  → egr +STRONG, dpf_soot +SLIGHT
    let step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[3]);

    // dtc_check — P0400/P0401 EGR codes  → egr +HEAVY
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    // soot_load_regen_history — moderate 40–75 %  → regen_fail +MEDIUM, dpf_soot +SLIGHT
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // differential_pressure — within normal spec  → dpf_soot -REDUCE, diff_sensor -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // egr_valve_operation — stuck open  → egr +HEAVY
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // exhaust_temp_sensor — plausible  → temp_sensor -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // forced_regen_assessment — completed successfully  → dpf_soot -REDUCE, regen_fail -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(7);

    // egr_valve = 0.25 + 0.35 + 0.40 + 0.40 = 1.40 — clear winner
    expect(topHypothesis(state)).toBe('egr_valve_issue');
    expect(state.hypothesisScores['egr_valve_issue']).toBeCloseTo(1.40, 5);
  });
});
