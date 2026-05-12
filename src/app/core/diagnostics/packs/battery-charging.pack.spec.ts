import { TestBed } from '@angular/core/testing';
import { DiagnosticEngineService } from '../diagnostic-engine.service';
import { DiagnosticState } from '../diagnostic-types';
import { batteryChargingPack } from './battery-charging.pack';

/**
 * Battery / Charging Pack — scenario walkthroughs
 *
 * Score constants (initial: 0.25 each, additive):
 *   HEAVY=0.40  STRONG=0.35  MEDIUM=0.20  SLIGHT=0.15  REDUCE=-0.20
 */

function topHypothesis(state: DiagnosticState): string {
  return Object.entries(state.hypothesisScores)
    .sort(([, a], [, b]) => b - a)[0][0];
}

describe('batteryChargingPack', () => {
  let engine: DiagnosticEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    engine = TestBed.inject(DiagnosticEngineService);
  });

  // ── Scenario A: Failing battery ──────────────────────────────────────────
  // Slow crank, resting voltage 11.8 V, charging voltage OK (alternator fine),
  // terminals clean, belt good, cranking voltage drops to 9.2 V. No overnight
  // drain issue. Expected winner: battery_failure_issue.
  it('Scenario A — failing battery: battery_failure_issue wins', () => {
    engine.startPack(batteryChargingPack);

    // symptom_confirm — slow / laboured cranking  → battery +MEDIUM, starter +SLIGHT
    let step = engine.getCurrentStep()!;
    expect(step.id).toBe('symptom_confirm');
    engine.applyAnswer(step.options[0]);

    // battery_voltage_off — below 12.0 V  → battery +HEAVY
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('battery_voltage_off');
    engine.applyAnswer(step.options[2]);

    // charging_voltage — normal 13.8–14.7 V  → alternator -REDUCE, belt -REDUCE
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('charging_voltage');
    engine.applyAnswer(step.options[0]);

    // terminal_ground_check — all clean and tight  → terminal -REDUCE, ground -REDUCE
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('terminal_ground_check');
    engine.applyAnswer(step.options[0]);

    // drive_belt_condition — good  → belt -REDUCE
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('drive_belt_condition');
    engine.applyAnswer(step.options[0]);

    // cranking_voltage_drop — below 9.6 V  → battery +STRONG, starter +MEDIUM, terminal +SLIGHT
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('cranking_voltage_drop');
    engine.applyAnswer(step.options[2]);

    // parasitic_drain — not tested (no overnight discharge)
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('parasitic_drain');
    engine.applyAnswer(step.options[3]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(7);

    // battery_failure_issue = 0.25 + 0.20 + 0.40 + 0.35 = 1.20 — clear winner
    expect(topHypothesis(state)).toBe('battery_failure_issue');
    expect(state.hypothesisScores['battery_failure_issue']).toBeCloseTo(1.20, 5);
  });

  // ── Scenario B: Alternator undercharging (slipping belt) ────────────────
  // Battery warning light on dash, resting voltage OK, charging voltage low,
  // belt glazed and slipping, terminals fine, cranking acceptable, no drain.
  // Expected winners: alternator_issue and drive_belt_issue above others.
  it('Scenario B — alternator + slipping belt: both score highest', () => {
    engine.startPack(batteryChargingPack);

    // symptom_confirm — battery warning light  → alternator +STRONG
    let step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // battery_voltage_off — 12.5 V or above (battery still OK)  → battery -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // charging_voltage — 13.5 V or below  → alternator +STRONG, belt +MEDIUM
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // terminal_ground_check — all clean  → terminal -REDUCE, ground -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // drive_belt_condition — slack / slipping  → belt +HEAVY, alternator +SLIGHT
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    // cranking_voltage_drop — 10.0 V or above  → battery -REDUCE, starter -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // parasitic_drain — not tested
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[3]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');

    // alternator = 0.25 + 0.35 + 0.35 + 0.15 = 1.10
    // drive_belt = 0.25 + 0.20 + 0.40 = 0.85  (belt REDUCE cancelled by charging step MEDIUM + slipping HEAVY)
    expect(state.hypothesisScores['alternator_issue']).toBeCloseTo(1.10, 5);
    expect(state.hypothesisScores['drive_belt_issue']).toBeGreaterThan(
      state.hypothesisScores['battery_failure_issue']
    );
  });

  // ── Scenario C: Parasitic drain ──────────────────────────────────────────
  // Battery repeatedly flat overnight. Resting voltage OK once charged.
  // Charging voltage fine. Terminals and belt fine. Cranking OK.
  // 130 mA draw confirmed. Expected winner: parasitic_drain_issue.
  it('Scenario C — parasitic drain: parasitic_drain_issue wins', () => {
    engine.startPack(batteryChargingPack);

    // symptom_confirm — battery goes flat overnight  → parasitic +STRONG
    let step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    // battery_voltage_off — 12.5 V or above (just charged)  → battery -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // charging_voltage — normal  → alternator -REDUCE, belt -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // terminal_ground_check — all clean  → terminal -REDUCE, ground -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // drive_belt_condition — good  → belt -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // cranking_voltage_drop — 10.0 V or above  → battery -REDUCE, starter -REDUCE
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // parasitic_drain — over 100 mA  → parasitic +HEAVY
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(7);

    // parasitic = 0.25 + 0.35 + 0.40 = 1.00 — clear winner
    expect(topHypothesis(state)).toBe('parasitic_drain_issue');
    expect(state.hypothesisScores['parasitic_drain_issue']).toBeCloseTo(1.00, 5);
  });
});
