import { TestBed } from '@angular/core/testing';
import { DiagnosticEngineService } from '../diagnostic-engine.service';
import type { DiagnosticState } from '../diagnostic-types';
import { evReducedPowerPack } from './ev-reduced-power.pack';

/**
 * EV Reduced Power / Charging Fault Pack — scenario walkthroughs
 *
 * Score constants (initial: 0.14 each, additive):
 *   HEAVY=0.40  STRONG=0.35  MEDIUM=0.20  SLIGHT=0.15  REDUCE=-0.20
 */

function topHypothesis(state: DiagnosticState): string {
  return Object.entries(state.hypothesisScores)
    .sort(([, a], [, b]) => b - a)[0][0];
}

describe('evReducedPowerPack', () => {
  let engine: DiagnosticEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    engine = TestBed.inject(DiagnosticEngineService);
  });

  // ── Scenario A: Battery thermal limiting ────────────────────────────────
  // Turtle mode after fast charging or sustained high-speed driving.
  // BMS over-temperature DTC, battery temp > 50 °C, inverter normal,
  // charge connection fine, isolation OK. Cool-down resolves it.
  // Expected winner: battery_thermal_issue.
  it('Scenario A — battery thermal limiting: battery_thermal_issue wins', () => {
    engine.startPack(evReducedPowerPack);

    // symptom_confirm — reduced power / turtle mode  → thermal +MEDIUM, soc +MEDIUM, inverter +MEDIUM
    let step = engine.getCurrentStep()!;
    expect(step.id).toBe('symptom_confirm');
    engine.applyAnswer(step.options[0]);

    // dtc_scan — battery over-temperature fault  → thermal +HEAVY
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('dtc_scan');
    engine.applyAnswer(step.options[1]);

    // soc_soh_temp — battery temp elevated > 40 °C at rest  → thermal +HEAVY
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('soc_soh_temp');
    engine.applyAnswer(step.options[3]);

    // cell_imbalance — balanced (< 50 mV spread)  → imbalance -REDUCE
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('cell_imbalance');
    engine.applyAnswer(step.options[0]);

    // inverter_motor_temp — within normal range  → inverter -REDUCE
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('inverter_motor_temp');
    engine.applyAnswer(step.options[0]);

    // charge_connection — not the primary complaint
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('charge_connection');
    engine.applyAnswer(step.options[4]);

    // hv_isolation — within spec  → hv -REDUCE
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('hv_isolation');
    engine.applyAnswer(step.options[0]);

    // next_action — cool-down period  → thermal +MEDIUM, inverter +MEDIUM
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('next_action');
    engine.applyAnswer(step.options[0]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(8);

    // battery_thermal = 0.14 + 0.20 + 0.40 + 0.40 + 0.20 = 1.34
    expect(topHypothesis(state)).toBe('battery_thermal_issue');
    expect(state.hypothesisScores['battery_thermal_issue']).toBeCloseTo(1.34, 5);
  });

  // ── Scenario B: Cell imbalance / SOH degradation ─────────────────────────
  // EV warning light, P0A80 BMS fault code, SOH below 75 %, significant
  // cell spread > 100 mV, inverter and thermals fine, isolation fine.
  // Expected winner: cell_imbalance_issue.
  it('Scenario B — cell imbalance: cell_imbalance_issue wins', () => {
    engine.startPack(evReducedPowerPack);

    // symptom_confirm — EV warning light, no clear power loss  → imbalance +MEDIUM, soc +MEDIUM, hv +SLIGHT
    let step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    // dtc_scan — BMS cell voltage / imbalance fault  → imbalance +HEAVY, soc +MEDIUM
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // soc_soh_temp — SOH below 75 %  → soc +HEAVY, imbalance +MEDIUM
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    // cell_imbalance — spread > 100 mV  → imbalance +HEAVY, soc +MEDIUM
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    // inverter_motor_temp — within normal  → inverter -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // charge_connection — not the primary complaint
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[4]);

    // hv_isolation — within spec  → hv -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // next_action — battery pack inspection  → imbalance +MEDIUM, soc +SLIGHT
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(8);

    // cell_imbalance = 0.25 + 0.20 + 0.40 + 0.20 + 0.40 + 0.20 + 0.20 = 1.85
    expect(topHypothesis(state)).toBe('cell_imbalance_issue');
    expect(state.hypothesisScores['cell_imbalance_issue']).toBeGreaterThan(
      state.hypothesisScores['low_soc_or_soh_issue']
    );
  });

  // ── Scenario C: HV isolation fault ──────────────────────────────────────
  // Orange lightning bolt warning on dash. P0AA6 isolation fault code.
  // Battery temp, SOC, SOH all normal. No cell imbalance. Inverter fine.
  // Isolation resistance below threshold. Next action: HV safety inspection.
  // Expected winner: hv_isolation_issue.
  it('Scenario C — HV isolation fault: hv_isolation_issue wins', () => {
    engine.startPack(evReducedPowerPack);

    // symptom_confirm — HV isolation warning  → hv +HEAVY
    let step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[3]);

    // dtc_scan — HV isolation fault code  → hv +HEAVY
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[4]);

    // soc_soh_temp — SOC/SOH/temp all normal  → thermal -REDUCE, soc -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // cell_imbalance — balanced  → imbalance -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // inverter_motor_temp — within normal  → inverter -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // charge_connection — not the primary complaint
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[4]);

    // hv_isolation — below minimum threshold  → hv +HEAVY
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    // next_action — HV safety inspection  → hv +STRONG
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[4]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(8);

    // hv_isolation = 0.14 + 0.40 + 0.40 + 0.40 + 0.35 = 1.69
    expect(topHypothesis(state)).toBe('hv_isolation_issue');
    expect(state.hypothesisScores['hv_isolation_issue']).toBeCloseTo(1.69, 5);
  });

  // ── Scenario D: Onboard charger fault ───────────────────────────────────
  // Car will not charge. OBC fault code. Charge port clean. Fault persists
  // across multiple cables and EVSE. All drive-related metrics normal.
  // Expected winner: onboard_charger_issue.
  it('Scenario D — OBC fault: onboard_charger_issue wins', () => {
    engine.startPack(evReducedPowerPack);

    // symptom_confirm — will not charge  → obc +STRONG, charge_connection +STRONG
    let step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // dtc_scan — OBC / EVSE communication fault  → obc +HEAVY, charge_connection +MEDIUM
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[3]);

    // soc_soh_temp — data available, all normal  → thermal -REDUCE, soc -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // cell_imbalance — balanced  → imbalance -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // inverter_motor_temp — within normal  → inverter -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // charge_connection — fault persists across cables/EVSE  → obc +HEAVY, charge_connection -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[3]);

    // hv_isolation — within spec  → hv -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // next_action — OBC or charge port repair  → obc +MEDIUM, charge_connection +SLIGHT
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[3]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(8);

    // onboard_charger = 0.14 + 0.35 + 0.40 + 0.40 + 0.20 = 1.49
    expect(topHypothesis(state)).toBe('onboard_charger_issue');
    expect(state.hypothesisScores['onboard_charger_issue']).toBeCloseTo(1.49, 5);
  });
});
