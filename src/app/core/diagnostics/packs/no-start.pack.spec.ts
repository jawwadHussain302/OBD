import { TestBed } from '@angular/core/testing';
import { DiagnosticEngineService } from '../diagnostic-engine.service';
import { DiagnosticState } from '../diagnostic-types';
import { noStartPack } from './no-start.pack';

/**
 * No-Start Pack — scenario walkthroughs
 *
 * Each scenario simulates a mechanic answering every step and verifies:
 *   - hypothesis score ordering matches the expected root cause
 *   - the pack completes (currentStepId === '')
 *   - answer history length matches steps taken
 *
 * Score arithmetic — initial: 0.25 each, deltas additive:
 *   HEAVY=0.40  STRONG=0.35  MEDIUM=0.20  SLIGHT=0.15  REDUCE=-0.20
 */

function topHypothesis(state: DiagnosticState): string {
  return Object.entries(state.hypothesisScores)
    .sort(([, a], [, b]) => b - a)[0][0];
}

describe('noStartPack', () => {
  let engine: DiagnosticEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    engine = TestBed.inject(DiagnosticEngineService);
  });

  // ── Scenario A: Fuel starvation ──────────────────────────────────────────
  // Mechanic hears cranking RPM, no pump prime, no fuel at rail — confirmed
  // upstream fuel failure. Skip branches to spark_check. Spark is fine.
  // Compression normal. Expected winner: fuel_issue.
  it('Scenario A — fuel starvation: fuel_issue wins', () => {
    engine.startPack(noStartPack);

    // Step 1: cranking_rpm — Yes (RPM rises)
    let step = engine.getCurrentStep()!;
    expect(step.id).toBe('cranking_rpm');
    engine.applyAnswer(step.options[0]); // Yes — RPM rises

    // Step 2: fuel_pump_prime — No (silence)
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('fuel_pump_prime');
    engine.applyAnswer(step.options[1]); // No — silence  → fuel_issue +STRONG (0.35)

    // Step 3: fuel_delivery — No (nothing at rail) → fuel_issue +STRONG (0.35), skip to spark_check
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('fuel_delivery');
    engine.applyAnswer(step.options[1]); // No — nothing at the rail

    // Step 4: spark_check (skipped fuel_pressure and injector_activity)
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('spark_check');
    engine.applyAnswer(step.options[0]); // Yes — strong blue spark

    // Step 5: compression — normal
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('compression');
    engine.applyAnswer(step.options[0]); // Normal  → compression_issue -REDUCE (-0.20)

    // Pack complete
    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(5);

    // fuel_issue = 0.25 + 0.35 + 0.35 = 0.95 — clearly the top cause
    expect(topHypothesis(state)).toBe('fuel_issue');
    expect(state.hypothesisScores['fuel_issue']).toBeCloseTo(0.95, 5);
  });

  // ── Scenario B: Ignition / coil fault ───────────────────────────────────
  // RPM visible, pump primes, fuel at rail with good pressure, injectors
  // clicking. But NO spark. Expected winner: ignition_issue.
  it('Scenario B — ignition fault: ignition_issue wins', () => {
    engine.startPack(noStartPack);

    // cranking_rpm — Yes
    let step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // fuel_pump_prime — Yes (heard hum)
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // fuel_delivery — Yes (fuel present)
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // fuel_pressure — Strong (within spec)
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // injector_activity — Yes (clicking)
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // spark_check — No spark  → ignition_issue +HEAVY (0.40)
    step = engine.getCurrentStep()!;
    expect(step.id).toBe('spark_check');
    engine.applyAnswer(step.options[1]);

    // compression — Normal  → compression_issue -0.20
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(7);

    // ignition_issue = 0.25 + 0.40 = 0.65
    expect(topHypothesis(state)).toBe('ignition_issue');
    expect(state.hypothesisScores['ignition_issue']).toBeCloseTo(0.65, 5);
  });

  // ── Scenario C: Crank sensor failure ────────────────────────────────────
  // RPM stays at zero during crank (no crank signal). Pump primes OK, fuel
  // at rail with good pressure. Injectors silent (ECU won't fire without
  // crank signal). Spark absent for same reason. Expected winner: crank_sensor_issue.
  it('Scenario C — crank sensor failure: crank_sensor_issue wins', () => {
    engine.startPack(noStartPack);

    // cranking_rpm — No (RPM stays at zero)  → crank_sensor_issue +HEAVY (0.40)
    let step = engine.getCurrentStep()!;
    expect(step.id).toBe('cranking_rpm');
    engine.applyAnswer(step.options[1]);

    // fuel_pump_prime — Yes (pump primes fine)
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // fuel_delivery — Yes
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // fuel_pressure — Strong
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[0]);

    // injector_activity — No (silent)  → fuel_issue +SLIGHT (0.15), crank_sensor_issue +MEDIUM (0.20)
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // spark_check — No spark  → ignition_issue +HEAVY (0.40)
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[1]);

    // compression — Not tested (no gauge)
    step = engine.getCurrentStep()!;
    engine.applyAnswer(step.options[2]);

    const state = engine.getState()!;
    expect(state.currentStepId).toBe('');
    expect(state.history.length).toBe(7);

    // crank_sensor_issue = 0.25 + 0.40 + 0.20 = 0.85
    // ignition_issue     = 0.25 + 0.40        = 0.65
    // fuel_issue         = 0.25 + 0.15        = 0.40
    expect(topHypothesis(state)).toBe('crank_sensor_issue');
    expect(state.hypothesisScores['crank_sensor_issue']).toBeCloseTo(0.85, 5);
  });
});
