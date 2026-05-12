import type { KnowledgePack } from '../diagnostic-types';
import { HEAVY, STRONG, MEDIUM, SLIGHT, REDUCE, SIX_HYPOTHESIS_INITIAL_CONFIDENCE } from './pack-scoring';

// ── Pack definition ───────────────────────────────────────────────────────────

export const dpfEgrPack: KnowledgePack = {
  id: 'dpf_egr',
  title: 'Diesel DPF / EGR Diagnostic',

  // Six root causes covering diesel particulate filter, EGR, and associated
  // sensors. Balanced starting confidence — no cause assumed before evidence.
  hypotheses: [
    { id: 'dpf_soot_overload_issue',              initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'regeneration_failure_issue',           initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'egr_valve_issue',                      initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'differential_pressure_sensor_issue',   initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'exhaust_temperature_sensor_issue',     initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'soot_related_turbo_restriction_issue', initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
  ],

  steps: [

    // ── STEP 1: Symptom confirmation ────────────────────────────────────────
    // First triage to steer scoring before any live data or tools are used.
    // Limp mode or DPF warning is a strong early indicator; frequent short
    // trips (preventing passive regen) points directly at soot accumulation.
    {
      id: 'symptom_confirm',
      instruction:
        'Ask the driver about recent symptoms before connecting any diagnostic tool.',
      question: 'What is the primary complaint?',
      options: [
        {
          label: 'DPF warning light on — limp mode active',
          // Hard DPF fault or blocked filter forcing safe mode.
          effect: { dpf_soot_overload_issue: STRONG, regeneration_failure_issue: MEDIUM },
        },
        {
          label: 'Frequent regeneration cycles noticed (smell, heat, idle for long periods)',
          // Passive regen not completing — short trips or faulty temp/pressure sensor.
          effect: { regeneration_failure_issue: STRONG, dpf_soot_overload_issue: SLIGHT },
        },
        {
          label: 'Poor acceleration / lack of power, no warning light',
          // Possible partial restriction: heavy soot load or EGR stuck open
          // recirculating excessive exhaust gas, diluting intake charge.
          effect: { soot_related_turbo_restriction_issue: MEDIUM, egr_valve_issue: MEDIUM },
        },
        {
          label: 'Black or grey smoke, rough idle, high fuel consumption',
          // EGR stuck open deposits or DPF regeneration issues causing combustion problems.
          effect: { egr_valve_issue: STRONG, dpf_soot_overload_issue: SLIGHT },
        },
      ],
    },

    // ── STEP 2: DPF / EGR-related DTCs ─────────────────────────────────────
    // Fault codes are the most direct evidence. DPF pressure codes (P244x)
    // point at the filter or differential pressure sensor. EGR codes (P040x,
    // P040x) point at valve or actuator. Temperature codes (P040x, P242x)
    // isolate sensor faults before condemning the filter.
    {
      id: 'dtc_check',
      instruction:
        'Connect the OBD2 adapter and read all stored and pending fault codes. Note any P244x (DPF pressure), P040x (EGR), P242x/P243x (DPF temperature), or P2002/P2003 (DPF efficiency) codes.',
      question: 'What fault codes are present?',
      options: [
        {
          label: 'P2002 / P2003 — DPF efficiency below threshold',
          // Direct evidence of excessive soot load or failed filter substrate.
          effect: { dpf_soot_overload_issue: HEAVY },
        },
        {
          label: 'P2452 / P2453 / P2454 — DPF differential pressure sensor fault',
          // Pressure sensor circuit or plausibility error — may falsely indicate
          // soot overload or mask a real restriction.
          effect: {
            differential_pressure_sensor_issue: HEAVY,
            dpf_soot_overload_issue: SLIGHT,
          },
        },
        {
          label: 'P0400 / P0401 / P0402 / P0404 — EGR flow or valve fault',
          effect: { egr_valve_issue: HEAVY },
        },
        {
          label: 'P242x — exhaust temperature sensor fault',
          // P242x codes (e.g. P2420, P2422) are DPF/exhaust temperature sensor
          // faults. P243x is the secondary air injection family — do not include
          // here. Faulty temp sensor prevents ECU from confirming safe regen temp,
          // causing repeated regen failures.
          effect: {
            exhaust_temperature_sensor_issue: HEAVY,
            regeneration_failure_issue: MEDIUM,
          },
        },
        {
          label: 'Multiple codes from several categories above',
          effect: {
            dpf_soot_overload_issue: MEDIUM,
            regeneration_failure_issue: MEDIUM,
            egr_valve_issue: MEDIUM,
          },
        },
        {
          label: 'No DPF / EGR codes — other or no codes',
          effect: {
            differential_pressure_sensor_issue: SLIGHT,
            exhaust_temperature_sensor_issue: SLIGHT,
          },
        },
      ],
    },

    // ── STEP 3: Soot load and regeneration history ──────────────────────────
    // Many scan tools can read DPF soot load (%) and distance/time since last
    // successful regeneration via manufacturer-specific PIDs or live data.
    // High soot load with no recent successful regen = regen failure.
    {
      id: 'soot_load_regen_history',
      instruction:
        'Using live data or manufacturer-specific diagnostics, read the DPF soot load percentage and the distance or time since the last successful regeneration (if supported by the scan tool).',
      question: 'What does the soot load / regeneration data show?',
      options: [
        {
          label: 'Soot load low (< 40 %) — recent successful regen confirmed',
          effect: { dpf_soot_overload_issue: REDUCE, regeneration_failure_issue: REDUCE },
        },
        {
          label: 'Soot load moderate (40–75 %) — regen overdue or incomplete',
          effect: { regeneration_failure_issue: MEDIUM, dpf_soot_overload_issue: SLIGHT },
        },
        {
          label: 'Soot load high (> 75 %) or regen counter not resetting',
          // Filter critically loaded — active regen required or filter may be damaged.
          effect: { dpf_soot_overload_issue: HEAVY, regeneration_failure_issue: STRONG },
        },
        {
          label: 'Data not available on this scan tool',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Differential pressure readings ──────────────────────────────
    // The differential pressure sensor measures the pressure drop across the
    // DPF. High pressure drop = high soot load or blocked filter. Low/zero
    // pressure drop with DPF codes = sensor fault (blocked pipe or failed sensor).
    {
      id: 'differential_pressure',
      instruction:
        'Read the DPF differential pressure sensor live data at idle and at 2000 RPM. Typical clean filter: < 5 kPa at idle, < 15 kPa at 2000 RPM. Consult the manufacturer spec for the specific vehicle.',
      question: 'What are the differential pressure readings?',
      options: [
        {
          label: 'Within normal spec at idle and 2000 RPM',
          effect: {
            dpf_soot_overload_issue: REDUCE,
            differential_pressure_sensor_issue: REDUCE,
          },
        },
        {
          label: 'Elevated — above spec, rises sharply with RPM',
          // High restriction across the filter — soot overload or melted substrate.
          effect: { dpf_soot_overload_issue: STRONG, soot_related_turbo_restriction_issue: MEDIUM },
        },
        {
          label: 'Zero or flat across all RPM — no pressure differential',
          // Sensor reading zero when filter must be loaded = sensor or pipe fault
          // (blocked sample pipe, failed sensor, or wiring open circuit).
          effect: {
            differential_pressure_sensor_issue: HEAVY,
            dpf_soot_overload_issue: SLIGHT,
          },
        },
        {
          label: 'Erratic or implausible — spikes / dropouts',
          effect: { differential_pressure_sensor_issue: STRONG },
        },
        {
          label: 'Not tested — live data not available',
          effect: {},
        },
      ],
    },

    // ── STEP 5: EGR valve operation ─────────────────────────────────────────
    // Observe commanded vs actual EGR valve position in live data. On vehicles
    // with vacuum-operated EGR, listen for the valve clicking open/closed.
    // Black carbon around the EGR ports is normal — sticky/seized valve is not.
    {
      id: 'egr_valve_operation',
      instruction:
        'In live data, compare EGR commanded position vs actual position while blipping the throttle from idle to ~2000 RPM. Alternatively, physically inspect the valve for sticking or excessive carbon build-up.',
      question: 'How is the EGR valve behaving?',
      options: [
        {
          label: 'Tracks commanded position correctly — no lag',
          effect: { egr_valve_issue: REDUCE },
        },
        {
          label: 'Stuck open — actual position remains high at idle',
          // EGR stuck open at idle = excessive exhaust gas recirculation,
          // rough idle, black smoke, loss of power.
          effect: { egr_valve_issue: HEAVY },
        },
        {
          label: 'Stuck closed — actual position near zero regardless of command',
          // EGR stuck closed = no recirculation, possible NOx DTC, but less
          // likely to cause driveability symptoms than stuck open.
          effect: { egr_valve_issue: STRONG },
        },
        {
          label: 'Slow or sticky — lags command by more than 10–15 %',
          effect: { egr_valve_issue: MEDIUM },
        },
        {
          label: 'Not tested — EGR live data not available',
          effect: {},
        },
      ],
    },

    // ── STEP 6: Exhaust temperature sensor plausibility ─────────────────────
    // The ECU uses exhaust temperature sensors (pre- and post-DPF) to manage
    // active regeneration. If a sensor reads implausibly low (< 100 °C on a
    // warm engine) or implausibly high when it should be cooling, the ECU may
    // abort regen prematurely or never initiate it.
    {
      id: 'exhaust_temp_sensor',
      instruction:
        'Read exhaust temperature sensor live data (pre-DPF and post-DPF if available) with the engine at normal operating temperature. Compare values against ambient and coolant temperature for plausibility.',
      question: 'What do the exhaust temperature sensor readings show?',
      options: [
        {
          label: 'Plausible — pre-DPF > post-DPF, values rise with load',
          effect: { exhaust_temperature_sensor_issue: REDUCE },
        },
        {
          label: 'One sensor reads implausibly cold (near ambient when engine warm)',
          // Open circuit or failed sensor — ECU may refuse regen if it cannot
          // confirm safe exhaust temperature.
          effect: {
            exhaust_temperature_sensor_issue: HEAVY,
            regeneration_failure_issue: MEDIUM,
          },
        },
        {
          label: 'Pre- and post-DPF sensors read the same value',
          // Identical readings = one sensor likely shorted or cross-wired;
          // no temperature drop visible across the filter.
          effect: { exhaust_temperature_sensor_issue: STRONG },
        },
        {
          label: 'Readings erratic or fluctuating at steady throttle',
          effect: { exhaust_temperature_sensor_issue: MEDIUM },
        },
        {
          label: 'Not tested — temperature PID not supported',
          effect: {},
        },
      ],
    },

    // ── STEP 7: Forced regeneration / cleaning assessment ───────────────────
    // The final step determines the most likely next action based on all
    // accumulated evidence. This is not a pass/fail — it focuses the outcome
    // on what is actionable: forced regen, sensor replacement, or valve cleaning.
    {
      id: 'forced_regen_assessment',
      instruction:
        'Attempt a forced / stationary regeneration via the scan tool (if supported and soot load permits — most tools will refuse if soot > 95 % due to fire risk). Observe whether regen initiates, completes, and whether exhaust temperatures reach 550–600 °C post-DPF.',
      question: 'What happened during the forced regeneration attempt?',
      options: [
        {
          label: 'Regen initiated and completed — post-DPF temp reached 550 °C+',
          // Successful forced regen: filter was loaded but mechanically intact.
          effect: {
            dpf_soot_overload_issue: REDUCE,
            regeneration_failure_issue: REDUCE,
          },
        },
        {
          label: 'Regen initiated but aborted before completion',
          // ECU aborted regen: most likely a temperature sensor fault preventing
          // confirmation of adequate exhaust temp, or soot load too high.
          effect: {
            regeneration_failure_issue: HEAVY,
            exhaust_temperature_sensor_issue: MEDIUM,
          },
        },
        {
          label: 'Scan tool refused to start regen — soot load too high',
          // Filter beyond safe regen threshold: physical removal and cleaning
          // or replacement required.
          effect: { dpf_soot_overload_issue: HEAVY, regeneration_failure_issue: STRONG },
        },
        {
          label: 'Forced regen not supported on this vehicle / scan tool',
          // Cannot confirm via forced regen — rely on earlier step scores.
          effect: {},
        },
      ],
    },

  ],
};
