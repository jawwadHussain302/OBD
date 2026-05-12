import type { KnowledgePack } from '../diagnostic-types';
import { HEAVY, STRONG, MEDIUM, SLIGHT, REDUCE, SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE } from './pack-scoring';

// ── Pack definition ───────────────────────────────────────────────────────────

export const highFuelConsumptionPack: KnowledgePack = {
  id: 'high_fuel_consumption',
  title: 'High Fuel Consumption Diagnostic',

  // Seven root causes covering the full excessive fuel use failure space.
  // 7 × 0.14 ≈ 0.98 — balanced starting point, no prior assumption.
  hypotheses: [
    { id: 'injector_leak_issue',     initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'rich_condition_issue',    initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'oxygen_sensor_issue',     initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'maf_sensor_issue',        initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'thermostat_issue',        initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'mechanical_drag_issue',   initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'catalyst_efficiency_issue', initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
  ],

  steps: [

    // ── STEP 1: Symptom Confirmation ────────────────────────────────────────
    // The presenting symptoms distinguish a combustion-quality problem (black
    // smoke, fuel smell, negative trims) from a mechanical load issue (no
    // running changes, just higher consumption) or a cold-running issue
    // (thermostat, which causes prolonged open-loop fuelling).
    {
      id: 'symptom_confirmation',
      instruction:
        'Ask the driver when the change in fuel economy was first noticed, whether any physical ' +
        'symptoms accompanied it (smoke, smell, rough running), and whether consumption is worse ' +
        'in city driving, cold weather, or all conditions equally.',
      question: 'Which best describes the fuel consumption symptom?',
      options: [
        {
          label: 'Black or dark exhaust smoke, especially under acceleration',
          // Rich combustion producing unburnt fuel in the exhaust.
          effect: { rich_condition_issue: STRONG, injector_leak_issue: MEDIUM },
        },
        {
          label: 'Strong fuel smell inside the cabin or from the exhaust',
          // Raw fuel smell without visible smoke suggests injector weeping or
          // a very rich condition passing through a degraded catalyst.
          effect: { injector_leak_issue: STRONG, rich_condition_issue: SLIGHT },
        },
        {
          label: 'Noticeably higher fuel bills — no other obvious symptoms',
          // Silent overconsumption is often thermostat (prolonged warm-up) or mechanical drag.
          effect: { thermostat_issue: SLIGHT, mechanical_drag_issue: SLIGHT },
        },
        {
          label: 'Worse in cold weather or on short trips only',
          // Extended open-loop enrichment due to a thermostat not reaching operating temperature.
          effect: { thermostat_issue: MEDIUM },
        },
        {
          label: 'Worse at higher speeds or on motorway drives',
          // Load-sensitive issues: fuel delivery over-pressure, catalyst efficiency loss,
          // or mechanical drag that increases with wheel speed.
          effect: { catalyst_efficiency_issue: SLIGHT, mechanical_drag_issue: SLIGHT },
        },
        {
          label: 'Not sure',
          effect: {},
        },
      ],
    },

    // ── STEP 2: Fuel-Related DTC Check ──────────────────────────────────────
    // The ECU logs rich corrections, sensor failures, and thermostat faults
    // with high reliability. P0128 (coolant temperature below thermostat
    // regulating temperature) is the most specific code for a stuck-open
    // thermostat and is definitively diagnostic when present.
    {
      id: 'dtc_review',
      instruction:
        'Read all stored and pending DTCs. Focus on: rich codes (P0172, P0175), oxygen sensor ' +
        'codes (P0131–P0141, P0151–P0161), MAF codes (P0100–P0103), thermostat code (P0128), ' +
        'and catalyst efficiency codes (P0420, P0430).',
      question: 'Which codes are present?',
      options: [
        {
          label: 'P0172 / P0175 — System rich (Bank 1 or Bank 2)',
          // ECU has been making negative fuel corrections — the engine is running measurably rich.
          effect: { rich_condition_issue: STRONG },
        },
        {
          label: 'P0131–P0141 / P0151–P0161 — Oxygen sensor voltage or response fault',
          // A lazy or biased O2 sensor can fool the ECU into maintaining a rich mixture.
          effect: { oxygen_sensor_issue: STRONG },
        },
        {
          label: 'P0100–P0103 — MAF sensor range or performance fault',
          effect: { maf_sensor_issue: MEDIUM },
        },
        {
          label: 'P0128 — Coolant temperature below thermostat regulating temperature',
          // This code is specific: the ECU measured that coolant is not reaching target temperature.
          // A stuck-open thermostat keeps the engine in open-loop rich fuelling far too long.
          effect: { thermostat_issue: HEAVY },
        },
        {
          label: 'P0420 / P0430 — Catalyst efficiency below threshold',
          effect: { catalyst_efficiency_issue: MEDIUM },
        },
        {
          label: 'No relevant codes stored',
          effect: {},
        },
        {
          label: 'Not checked',
          effect: {},
        },
      ],
    },

    // ── STEP 3: Fuel Trims and Oxygen Sensor Behaviour ──────────────────────
    // Negative fuel trims confirm the ECU is actively reducing fuelling to
    // compensate for excess fuel — consistent with leaking injectors, high
    // fuel pressure, or a faulty sensor driving rich correction.
    // An O2 sensor that switches slowly or is biased toward rich will hold
    // the mixture richer than stoichiometric without logging a code.
    {
      id: 'fuel_trim_o2_check',
      instruction:
        'With the engine fully warm at idle, read STFT and LTFT on the scan tool. ' +
        'Also observe the downstream O2 sensor waveform — it should switch between 0.1 V and 0.9 V ' +
        'several times per second. A sensor biased high (consistently above 0.5 V) or switching ' +
        'slowly indicates contamination or failure.',
      question: 'What do fuel trims and O2 sensor data show?',
      options: [
        {
          label: 'STFT and LTFT both negative (below -10%) — ECU correcting rich',
          // The ECU is fighting a persistent rich input — most likely leaking injectors,
          // a biased O2 sensor reporting lean, or excessive fuel pressure.
          effect: { rich_condition_issue: MEDIUM, injector_leak_issue: MEDIUM },
        },
        {
          label: 'O2 sensor slow to switch or consistently above 0.5 V (biased rich)',
          // A lazy or high-biased upstream O2 sensor tells the ECU the mixture is always
          // lean, causing persistent excess fuelling.
          effect: { oxygen_sensor_issue: STRONG },
        },
        {
          label: 'Trims normal (±10%) and O2 sensor switching correctly',
          // Normal closed-loop operation rules out sensor bias and gross rich conditions.
          effect: { rich_condition_issue: REDUCE, oxygen_sensor_issue: REDUCE },
        },
        {
          label: 'Not checked — no scan tool available',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Coolant Temperature and Thermostat Check ────────────────────
    // A thermostat stuck open prevents the engine reaching operating temperature.
    // The ECU uses coolant temperature to determine when to exit open-loop
    // fuelling (rich) and enter closed-loop control. An engine that runs
    // permanently below 80–90°C wastes fuel in every driving cycle.
    {
      id: 'thermostat_check',
      instruction:
        'Observe the coolant temperature gauge or the live coolant temperature PID on the scan tool ' +
        'after a 15-minute drive. It should stabilise between 85–100°C (185–212°F) and hold there. ' +
        'A gauge that sits in the lower quarter or a PID that never exceeds 75°C confirms a ' +
        'stuck-open thermostat. An infrared gun on the thermostat housing versus the lower radiator ' +
        'hose can also confirm flow when it should not be flowing.',
      question: 'What does the coolant temperature show?',
      options: [
        {
          label: 'Temperature never reaches normal — stays low even after a long drive',
          // Definitive thermostat failure: engine never exits open-loop enrichment.
          effect: { thermostat_issue: HEAVY },
        },
        {
          label: 'Temperature reaches normal but takes unusually long to warm up',
          // Sluggish warm-up: marginal thermostat — partially stuck open.
          effect: { thermostat_issue: MEDIUM },
        },
        {
          label: 'Temperature reaches and holds normal operating range',
          // Thermostat is functioning correctly.
          effect: { thermostat_issue: REDUCE },
        },
        {
          label: 'Not checked',
          effect: {},
        },
      ],
    },

    // ── STEP 5: MAF Sensor and Air Filter Inspection ─────────────────────────
    // A MAF sensor that reads higher than actual airflow causes the ECU to
    // add excess fuel. A severely restricted air filter raises intake vacuum,
    // increasing the engine's pumping effort, but more critically can cause
    // the MAF element to read incorrectly or allow unfiltered air past a
    // compromised filter seal.
    {
      id: 'maf_and_filter',
      instruction:
        'Read the MAF output in g/s at warm idle and compare with the expected value for the ' +
        'engine displacement (approximately 0.8–1.0 g/s per litre at idle). ' +
        'Inspect the air filter — a heavily soiled filter increases intake restriction. ' +
        'Inspect the MAF sensor element for contamination; clean if needed with dedicated ' +
        'MAF sensor cleaner.',
      question: 'What did the MAF and filter inspection reveal?',
      options: [
        {
          label: 'MAF reads high for engine size — above expected idle range',
          // Over-reading MAF causes the ECU to calculate and deliver too much fuel.
          effect: { maf_sensor_issue: STRONG },
        },
        {
          label: 'Air filter heavily blocked or dirty MAF element visible',
          // A heavily clogged filter increases restriction and can affect MAF signal quality.
          effect: { maf_sensor_issue: SLIGHT, rich_condition_issue: SLIGHT },
        },
        {
          label: 'MAF reading normal, air filter clean',
          effect: { maf_sensor_issue: REDUCE },
        },
        {
          label: 'Not checked',
          effect: {},
        },
      ],
    },

    // ── STEP 6: Injector Leak Check ──────────────────────────────────────────
    // A leaking injector (stuck partially open) continuously drips fuel into
    // the cylinder between firing events. Symptoms include wet/sooty spark plugs
    // on the affected cylinder, fuel in the intake, and fuel pressure bleeding
    // down rapidly after the engine is switched off. High fuel rail pressure
    // from a faulty regulator compounds injector leak volume.
    {
      id: 'injector_leak_check',
      instruction:
        'Remove the spark plugs and inspect each for a wet, black, or fuel-soaked appearance on ' +
        'a specific cylinder — this indicates an injector dripping on that cylinder. ' +
        'Fit a fuel pressure gauge; switch ignition ON, then off without cranking. ' +
        'Pressure should hold for several minutes — rapid bleed-down (>5 psi per minute) ' +
        'indicates a leaking injector or faulty pressure regulator. ' +
        'Check fuel pressure against spec — too high forces excess fuel past all injectors.',
      question: 'What does injector and fuel pressure inspection show?',
      options: [
        {
          label: 'Fuel pressure bleeds down rapidly after key-off (>5 psi/min)',
          // Leaking injector or pressure regulator — fuel drains back from the rail into cylinders.
          effect: { injector_leak_issue: HEAVY },
        },
        {
          label: 'Spark plug on one cylinder is wet or heavily sooted with fuel',
          // Direct evidence of injector leaking on that cylinder between firing events.
          effect: { injector_leak_issue: STRONG },
        },
        {
          label: 'Fuel pressure significantly above manufacturer spec',
          // High rail pressure forces additional fuel through all injectors on every pulse.
          effect: { rich_condition_issue: MEDIUM, injector_leak_issue: SLIGHT },
        },
        {
          label: 'Fuel pressure holds and plugs look normal',
          effect: { injector_leak_issue: REDUCE },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 7: Mechanical Drag and Rolling Resistance ───────────────────────
    // Mechanical drag increases the load the engine must overcome, consuming
    // more fuel to maintain speed. Dragging brakes generate heat and wheel
    // resistance. Severely under-inflated tyres increase rolling resistance
    // substantially. A seized wheel bearing or parking brake partially applied
    // can account for a meaningful MPG reduction, especially in urban driving.
    {
      id: 'mechanical_drag_check',
      instruction:
        'After a 10-minute drive, carefully check each wheel hub with your hand — a dragging brake ' +
        'or bearing will be noticeably hotter than the others. Check all four tyre pressures against ' +
        'the door placard spec. Roll the vehicle on level ground with the engine off (manual in neutral) ' +
        'and listen for unusual rolling noise or resistance.',
      question: 'What did the mechanical drag check reveal?',
      options: [
        {
          label: 'One or more wheel hubs noticeably hotter than others — brake drag',
          // Brake calliper, shoe, or handbrake not releasing fully.
          effect: { mechanical_drag_issue: STRONG },
        },
        {
          label: 'Tyres significantly under-inflated (more than 10 psi below spec)',
          // Under-inflation substantially increases rolling resistance, particularly at speed.
          effect: { mechanical_drag_issue: MEDIUM },
        },
        {
          label: 'Abnormal rolling noise or resistance — suspect wheel bearing',
          effect: { mechanical_drag_issue: MEDIUM },
        },
        {
          label: 'All wheels cool, tyres correct, no unusual drag detected',
          effect: { mechanical_drag_issue: REDUCE },
        },
        {
          label: 'Not checked',
          effect: {},
        },
      ],
    },

    // ── STEP 8: Catalyst Efficiency and Exhaust Clues ────────────────────────
    // A degraded catalytic converter no longer oxidises hydrocarbons efficiently.
    // The downstream O2 sensor mirrors the upstream sensor (switching similarly)
    // rather than remaining stable — this is what triggers P0420. A damaged or
    // missing catalyst passes unburnt fuel vapour, contributing to consumption
    // measurements and the perception of poor economy. The exhaust smell is also
    // diagnostic: sulphur (rotten egg) indicates unoxidised fuel reaching the cat.
    {
      id: 'catalyst_check',
      instruction:
        'Observe the downstream O2 sensor waveform on the scan tool — it should remain relatively ' +
        'flat (stable near 0.6–0.7 V). If it mirrors the upstream sensor (switching rapidly), ' +
        'the catalytic converter is not working. Smell the exhaust — a rotten-egg or raw-fuel ' +
        'odour indicates unburnt hydrocarbons passing through the cat. ' +
        'Check for P0420 / P0430 if not already reviewed.',
      question: 'What do catalyst and exhaust checks show?',
      options: [
        {
          label: 'Downstream O2 mirrors upstream — catalyst not converting',
          // The catalyst is not performing its oxidation function — efficiency below threshold.
          effect: { catalyst_efficiency_issue: STRONG },
        },
        {
          label: 'Strong sulphur / rotten-egg smell or raw fuel odour from exhaust',
          // Unoxidised hydrocarbons reach the tailpipe — either very rich mixture or failed cat.
          effect: { rich_condition_issue: MEDIUM, catalyst_efficiency_issue: SLIGHT },
        },
        {
          label: 'Downstream O2 stable, exhaust odour normal',
          // Catalyst is performing correctly.
          effect: { catalyst_efficiency_issue: REDUCE },
        },
        {
          label: 'Not checked',
          effect: {},
          // No next → pack complete
        },
      ],
    },

  ],
};
