import { noStartPack } from './no-start.pack';
import { createPackState, applyAnswer } from './knowledge-pack.model';

describe('noStartPack', () => {

  it('should initialise with balanced hypotheses (0.25 each)', () => {
    const state = createPackState(noStartPack);
    expect(state.hypotheses).toHaveSize(4);
    state.hypotheses.forEach(h => expect(h.score).toBeCloseTo(0.25));
    expect(state.isComplete).toBeFalse();
    expect(state.currentStepIndex).toBe(0);
  });

  it('should converge on crank_sensor_issue when RPM is 0 during cranking', () => {
    let state = createPackState(noStartPack);

    // Step 1: RPM stays at 0 → crank sensor heavily favoured
    const step1 = noStartPack.steps[0];
    const noRpmOption = step1.options.find(o => o.label.includes('stays at 0'))!;
    state = applyAnswer(state, noStartPack, noRpmOption);

    const crankH = state.hypotheses.find(h => h.id === 'crank_sensor_issue')!;
    const fuelH  = state.hypotheses.find(h => h.id === 'fuel_issue')!;
    expect(crankH.score).toBeGreaterThan(fuelH.score);
    expect(state.currentStepIndex).toBe(1);
  });

  it('should converge on fuel_issue when no fuel prime, no fuel at rail, zero pressure', () => {
    let state = createPackState(noStartPack);

    // Step 1: RPM > 200 (crank sensor OK)
    state = applyAnswer(state, noStartPack, noStartPack.steps[0].options[0]);

    // Step 2: No fuel pump prime sound
    state = applyAnswer(state, noStartPack, noStartPack.steps[1].options[1]);

    // Step 3: No fuel at rail
    state = applyAnswer(state, noStartPack, noStartPack.steps[2].options[1]);

    // Step 4: Zero pressure
    state = applyAnswer(state, noStartPack, noStartPack.steps[3].options[2]);

    const fuelH = state.hypotheses.find(h => h.id === 'fuel_issue')!;
    const sorted = [...state.hypotheses].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('fuel_issue');
    expect(fuelH.score).toBeGreaterThan(0.6);
  });

  it('should converge on ignition_issue when no spark is found', () => {
    let state = createPackState(noStartPack);

    // Step 1: RPM OK
    state = applyAnswer(state, noStartPack, noStartPack.steps[0].options[0]);
    // Step 2: Prime heard
    state = applyAnswer(state, noStartPack, noStartPack.steps[1].options[0]);
    // Step 3: Fuel at rail
    state = applyAnswer(state, noStartPack, noStartPack.steps[2].options[0]);
    // Step 4: Pressure strong
    state = applyAnswer(state, noStartPack, noStartPack.steps[3].options[0]);
    // Step 5: Injectors firing
    state = applyAnswer(state, noStartPack, noStartPack.steps[4].options[0]);
    // Step 6: No spark
    state = applyAnswer(state, noStartPack, noStartPack.steps[5].options[1]);

    const ignH = state.hypotheses.find(h => h.id === 'ignition_issue')!;
    const sorted = [...state.hypotheses].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('ignition_issue');
    expect(ignH.score).toBeGreaterThan(0.4);
  });

  it('should converge on compression_issue when low compression is found', () => {
    let state = createPackState(noStartPack);

    // All "good" until compression
    state = applyAnswer(state, noStartPack, noStartPack.steps[0].options[0]); // RPM OK
    state = applyAnswer(state, noStartPack, noStartPack.steps[1].options[0]); // Prime heard
    state = applyAnswer(state, noStartPack, noStartPack.steps[2].options[0]); // Fuel present
    state = applyAnswer(state, noStartPack, noStartPack.steps[3].options[0]); // Pressure strong
    state = applyAnswer(state, noStartPack, noStartPack.steps[4].options[0]); // Injectors firing
    state = applyAnswer(state, noStartPack, noStartPack.steps[5].options[0]); // Spark present
    // Step 7: Low compression
    state = applyAnswer(state, noStartPack, noStartPack.steps[6].options[1]);

    expect(state.isComplete).toBeTrue();
    const sorted = [...state.hypotheses].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('compression_issue');
  });

  it('should mark isComplete after the last step', () => {
    let state = createPackState(noStartPack);
    noStartPack.steps.forEach(step => {
      state = applyAnswer(state, noStartPack, step.options[0]);
    });
    expect(state.isComplete).toBeTrue();
    expect(state.completedSteps).toHaveSize(noStartPack.steps.length);
  });

  it('should clamp scores to 0–1', () => {
    let state = createPackState(noStartPack);
    // Apply all options that push fuel_issue high
    noStartPack.steps.forEach(step => {
      const worst = step.options.reduce((max, o) =>
        (o.scoreDeltas['fuel_issue'] ?? 0) > (max.scoreDeltas['fuel_issue'] ?? 0) ? o : max,
        step.options[0]
      );
      state = applyAnswer(state, noStartPack, worst);
    });
    state.hypotheses.forEach(h => {
      expect(h.score).toBeGreaterThanOrEqual(0);
      expect(h.score).toBeLessThanOrEqual(1);
    });
  });

  it('should have all 7 steps defined', () => {
    expect(noStartPack.steps).toHaveSize(7);
  });

  it('should have at least 2 options per step with no dead ends', () => {
    noStartPack.steps.forEach(step => {
      expect(step.options.length).toBeGreaterThanOrEqual(2);
      // Every option must have score deltas for at least one hypothesis
      step.options.forEach(opt => {
        const hasDeltas = Object.keys(opt.scoreDeltas).length > 0;
        expect(hasDeltas).toBeTrue();
      });
    });
  });
});
