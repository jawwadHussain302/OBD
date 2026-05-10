import { DiagnosticEngineService } from './diagnostic-engine.service';
import { KnowledgePack } from './diagnostic-types';

describe('DiagnosticEngineService (Guided Engine)', () => {
  let service: DiagnosticEngineService;

  beforeEach(() => {
    service = new DiagnosticEngineService();
  });

  it('should initialize correctly and state should be null initially', () => {
    expect(service.getState()).toBeNull();
  });

  it('should start a pack and set initial state', () => {
    const pack: KnowledgePack = {
      id: 'no_start_pack',
      title: 'No Start Engine',
      hypotheses: [
        { id: 'fuel_pump_failure', initialConfidence: 0.1 },
        { id: 'dead_battery', initialConfidence: 0.5 }
      ],
      steps: [
        {
          id: 'step_1',
          instruction: 'Turn the key to ON.',
          question: 'Do you hear the fuel pump priming?',
          options: [
            { label: 'Yes', effect: { 'fuel_pump_failure': -0.4 }, next: 'step_2' },
            { label: 'No', effect: { 'fuel_pump_failure': 0.6 }, next: 'step_3' }
          ]
        },
        {
          id: 'step_2',
          instruction: 'Check battery voltage.',
          question: 'Is battery voltage > 12V?',
          options: [
            { label: 'Yes', effect: { 'dead_battery': -0.5 } },
            { label: 'No', effect: { 'dead_battery': 0.5 } }
          ]
        },
        {
          id: 'step_3',
          instruction: 'Check fuel pump fuse.',
          question: 'Is the fuse blown?',
          options: [
            { label: 'Yes', effect: { 'fuel_pump_failure': 0.8 } },
            { label: 'No', effect: { 'fuel_pump_failure': -0.1 } }
          ]
        }
      ]
    };

    service.startPack(pack);

    const state = service.getState();
    expect(state).toBeTruthy();
    expect(state?.activePackId).toBe('no_start_pack');
    expect(state?.hypothesisScores).toEqual({
      'fuel_pump_failure': 0.1,
      'dead_battery': 0.5
    });
    expect(state?.currentStepId).toBe('step_1');
    expect(state?.history).toEqual([]);

    expect(service.getCurrentStep()?.id).toBe('step_1');
  });

  it('should apply an answer, update scores and move to next step', () => {
    const pack: KnowledgePack = {
      id: 'no_start_pack',
      title: 'No Start Engine',
      hypotheses: [
        { id: 'fuel_pump_failure', initialConfidence: 0.1 },
        { id: 'dead_battery', initialConfidence: 0.5 }
      ],
      steps: [
        {
          id: 'step_1',
          instruction: 'Turn the key to ON.',
          question: 'Do you hear the fuel pump priming?',
          options: [
            { label: 'Yes', effect: { 'fuel_pump_failure': -0.4 }, next: 'step_2' },
            { label: 'No', effect: { 'fuel_pump_failure': 0.6 }, next: 'step_3' }
          ]
        },
        {
          id: 'step_2',
          instruction: 'Check battery voltage.',
          question: 'Is battery voltage > 12V?',
          options: [
            { label: 'Yes', effect: { 'dead_battery': -0.5 } },
            { label: 'No', effect: { 'dead_battery': 0.5 } }
          ]
        }
      ]
    };

    service.startPack(pack);

    // Apply "Yes" to step_1
    service.applyAnswer(pack.steps[0].options[0]);

    const state = service.getState();
    expect(state?.hypothesisScores['fuel_pump_failure']).toBeCloseTo(-0.3); // 0.1 - 0.4
    expect(state?.hypothesisScores['dead_battery']).toBe(0.5); // unchanged
    expect(state?.currentStepId).toBe('step_2');
    expect(state?.history.length).toBe(1);
    expect(state?.history[0]).toEqual({ stepId: 'step_1', selectedOption: 'Yes' });
  });

  it('should auto-advance to next step in array if next is not provided', () => {
    const pack: KnowledgePack = {
      id: 'pack_1',
      title: 'Pack 1',
      hypotheses: [
        { id: 'hyp_1', initialConfidence: 0 }
      ],
      steps: [
        {
          id: 'step_1',
          instruction: 'Instruction 1',
          question: 'Question 1',
          options: [
            { label: 'Opt 1', effect: { 'hyp_1': 0.5 } }
          ]
        },
        {
          id: 'step_2',
          instruction: 'Instruction 2',
          question: 'Question 2',
          options: [
             { label: 'Opt 2', effect: { 'hyp_1': 0.5 } }
          ]
        }
      ]
    };

    service.startPack(pack);
    service.applyAnswer(pack.steps[0].options[0]);

    expect(service.getState()?.currentStepId).toBe('step_2');
  });

  it('should end pack when applying answer on last step without next', () => {
     const pack: KnowledgePack = {
      id: 'pack_1',
      title: 'Pack 1',
      hypotheses: [
        { id: 'hyp_1', initialConfidence: 0 }
      ],
      steps: [
        {
          id: 'step_1',
          instruction: 'Instruction 1',
          question: 'Question 1',
          options: [
            { label: 'Opt 1', effect: { 'hyp_1': 0.5 } }
          ]
        }
      ]
    };

    service.startPack(pack);
    service.applyAnswer(pack.steps[0].options[0]);

    expect(service.getState()?.currentStepId).toBe('');
    expect(service.getCurrentStep()).toBeNull();
  });
});
