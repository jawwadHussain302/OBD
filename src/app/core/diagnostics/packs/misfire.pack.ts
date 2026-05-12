import type { KnowledgePack } from '../diagnostic-types';
import { HEAVY, STRONG, MEDIUM, SLIGHT, REDUCE, SIX_HYPOTHESIS_INITIAL_CONFIDENCE } from './pack-scoring';

// ── Pack definition ───────────────────────────────────────────────────────────

export const misfirePack: KnowledgePack = {
  id: 'misfire',
  title: 'Misfire Diagnostic',

  // Six root causes covering the full misfire failure space.
  // Balanced starting point — 6 × 0.17 ≈ 1.0, no prior assumption.
  hypotheses: [
    { id: 'ignition_coil_issue',  initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'spark_plug_issue',     initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'injector_issue',       initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'wiring_or_ecu_issue',  initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'compression_issue',    initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'intake_leak_issue',    initialConfidence: SIX_HYPOTHESIS_INITIAL_CONFIDENCE },
  ],

  steps: [

    // ── STEP 1: Cylinder Identification ────────────────────────────────────
    // Informational — establishes which cylinder is misfiring before any
    // physical tests begin. P030X codes map directly to cylinder numbers.
    // P0300 (random misfire) shifts suspicion toward systemic causes
    // (fuel pressure, vacuum leak) rather than cylinder-specific hardware.
    {
      id: 'cylinder_identification',
      instruction:
        'Review stored DTCs and misfire counters on the scan tool. ' +
        'P0301–P0304 indicate a specific cylinder. P0300 indicates a random or multiple-cylinder misfire.',
      question: 'Which cylinder is primarily affected?',
      options: [
        {
          label: 'P0301 — Cylinder 1',
          effect: {},
        },
        {
          label: 'P0302 — Cylinder 2',
          effect: {},
        },
        {
          label: 'P0303 — Cylinder 3',
          effect: {},
        },
        {
          label: 'P0304 — Cylinder 4',
          effect: {},
        },
        {
          label: 'P0300 — Random / multiple cylinders',
          // Random misfire broadens the scope — intake or fuel delivery
          // issues are more plausible when no single cylinder is implicated.
          effect: { intake_leak_issue: SLIGHT, injector_issue: SLIGHT },
        },
        {
          label: 'Not sure / no code stored',
          effect: {},
        },
      ],
    },

    // ── STEP 2: Ignition Coil Swap Test ────────────────────────────────────
    // Moving the coil to another cylinder and rechecking which cylinder DTC
    // appears is the single most decisive test for coil-specific ignition failure.
    // If the misfire follows the coil, causation is effectively confirmed.
    {
      id: 'coil_swap_test',
      instruction:
        'Swap the ignition coil from the affected cylinder with the coil from a known-good cylinder. ' +
        'Clear codes and run the engine for 2–3 minutes or perform a drive cycle.',
      question: 'After the swap, did the misfire DTC move to the other cylinder?',
      options: [
        {
          label: 'Yes — misfire followed the coil to the new cylinder',
          // Definitive: coil carries the fault to a cylinder that was previously healthy.
          effect: { ignition_coil_issue: STRONG },
        },
        {
          label: 'No — misfire stayed on the same cylinder',
          // Coil is not the cause; cylinder-specific fault (plug, injector, compression).
          effect: { ignition_coil_issue: REDUCE },
        },
        {
          label: 'Not tested — coil not accessible or swap not practical',
          effect: {},
        },
      ],
    },

    // ── STEP 3: Spark Plug Inspection / Swap ───────────────────────────────
    // Visual inspection often reveals the cause directly (oil fouling, cracked
    // porcelain, worn electrode). A plug swap test confirms causation the same
    // way the coil swap does.
    {
      id: 'spark_plug_inspection',
      instruction:
        'Remove the spark plug from the affected cylinder. Inspect for fouling, cracked porcelain, ' +
        'worn or eroded electrode, or heavy carbon deposits. If appearance is suspect, swap with a ' +
        'plug from a known-good cylinder and retest.',
      question: 'Was the spark plug worn, fouled, damaged, or did the misfire move with the plug?',
      options: [
        {
          label: 'Yes — plug was visibly faulty or misfire followed the plug',
          effect: { spark_plug_issue: STRONG },
        },
        {
          label: 'No — plug looks serviceable and misfire did not follow',
          effect: { spark_plug_issue: REDUCE },
        },
        {
          label: 'Not tested — plug not accessed',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Injector Activity Check ────────────────────────────────────
    // Injectors should produce an audible click at idle. Absence of clicking
    // points either to the injector body itself or to the ECU driver circuit
    // or wiring not delivering the pulse — both are captured here.
    {
      id: 'injector_activity_check',
      instruction:
        'Use a mechanic\'s stethoscope or screwdriver handle to listen at the injector body while ' +
        'the engine idles. Alternatively, fit a noid light to the injector harness connector and ' +
        'crank or idle the engine.',
      question: 'Is the injector operating normally — clicking or noid light flashing?',
      options: [
        {
          label: 'No — silent or noid light dead',
          // Absence of pulse is consistent with a dead injector OR an open/shorted
          // driver circuit. Both hypotheses receive equal uplift until the swap
          // test in Step 5 differentiates them.
          effect: { injector_issue: MEDIUM, wiring_or_ecu_issue: MEDIUM },
        },
        {
          label: 'Yes — clicking normally / noid light flashing',
          // Injector is being commanded — reduces likelihood of ECU/wiring fault.
          effect: { injector_issue: REDUCE, wiring_or_ecu_issue: REDUCE },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 5: Injector Swap Test ──────────────────────────────────────────
    // Swapping the injector body to another cylinder distinguishes a failed
    // injector from a wiring or ECU driver fault. If the fault follows the
    // injector, the injector is the cause. If it stays on the same cylinder,
    // the fault is in the harness or ECU output.
    {
      id: 'injector_swap_test',
      instruction:
        'If accessible, swap the injector from the affected cylinder with a known-good cylinder. ' +
        'Clear codes and retest. Note which cylinder now misfires.',
      question: 'Did the misfire move to the cylinder that received the swapped injector?',
      options: [
        {
          label: 'Yes — misfire followed the injector',
          // Injector body is the fault; wiring and ECU output are absolved.
          effect: { injector_issue: STRONG, wiring_or_ecu_issue: REDUCE },
        },
        {
          label: 'No — misfire stayed on the original cylinder',
          // Injector body is not the cause; fault is in the fixed wiring or ECU driver.
          effect: { injector_issue: REDUCE, wiring_or_ecu_issue: SLIGHT },
        },
        {
          label: 'Not tested — swap not practical',
          effect: {},
        },
      ],
    },

    // ── STEP 6: Compression Test ────────────────────────────────────────────
    // Low compression is caused by worn rings, burnt valves, a blown head gasket,
    // or a jumped timing chain. A cylinder with low compression cannot generate
    // enough combustion pressure to fire reliably regardless of spark or fuel.
    {
      id: 'compression_test',
      instruction:
        'Remove the spark plug. Fit a compression gauge and crank for 4–6 revolutions. ' +
        'Compare the reading against manufacturer spec (typically 150–200 psi petrol) and ' +
        'against the other cylinders — readings should be within 10% of each other.',
      question: 'Is compression lower than spec or significantly lower than adjacent cylinders?',
      options: [
        {
          label: 'Yes — low or uneven compression on this cylinder',
          effect: { compression_issue: HEAVY },
        },
        {
          label: 'No — compression within spec and consistent with other cylinders',
          // Good compression definitively rules out mechanical cause.
          effect: { compression_issue: REDUCE },
        },
        {
          label: 'Not tested — no compression gauge available',
          effect: {},
        },
      ],
    },

    // ── STEP 7: Intake / Vacuum Leak Inspection ─────────────────────────────
    // A localised intake manifold gasket leak or cracked vacuum hose near one
    // cylinder leans out that cylinder's mixture enough to cause a misfire.
    // This is particularly common after manifold removal or on high-mileage engines
    // with degraded gaskets.
    {
      id: 'intake_leak_inspection',
      instruction:
        'Inspect the intake manifold gasket and vacuum hose connections around the affected cylinder. ' +
        'Use carb cleaner or propane enrichment near suspect joints at idle — an RPM change indicates ' +
        'an air leak. A smoke machine fed into the intake provides the most reliable result.',
      question: 'Was a localised air or vacuum leak found near the affected cylinder?',
      options: [
        {
          label: 'Yes — leak confirmed at intake gasket or vacuum hose',
          effect: { intake_leak_issue: STRONG },
        },
        {
          label: 'No — no leak detected',
          // No evidence of induction leak — reduces this hypothesis.
          effect: { intake_leak_issue: REDUCE },
        },
        {
          label: 'Not tested',
          effect: {},
          // No next → pack complete (last step in array)
        },
      ],
    },

  ],
};
