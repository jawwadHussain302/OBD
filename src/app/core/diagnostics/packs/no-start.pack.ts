import { KnowledgePack } from './knowledge-pack.model';

/**
 * No-Start / Hard-Start Diagnostic Pack
 *
 * Guides a mechanic through a systematic 7-step no-start workflow.
 * Each answer updates hypothesis scores for 4 root causes:
 *   - fuel_issue         (fuel delivery / pressure / injection)
 *   - ignition_issue     (spark / coil / ignition module)
 *   - crank_sensor_issue (crank position sensor / no-crank signal)
 *   - compression_issue  (mechanical — rings, valves, timing)
 *
 * Score deltas are calibrated so a single definitive answer (e.g. "No spark")
 * pushes one hypothesis to dominance, while uncertain answers spread evidence
 * equally or make small adjustments.
 */
export const noStartPack: KnowledgePack = {
  id: 'no_start',
  name: 'No-Start / Hard-Start',
  description: 'Guides through crank, fuel, spark, and compression checks to isolate a no-start root cause.',
  symptomTags: ['no-start', 'hard-start', 'cranks-no-start', 'engine-wont-start'],

  initialHypotheses: [
    { id: 'fuel_issue',         label: 'Fuel Delivery / Injection',   score: 0.25 },
    { id: 'ignition_issue',     label: 'Ignition / Spark',            score: 0.25 },
    { id: 'crank_sensor_issue', label: 'Crank Position Sensor',       score: 0.25 },
    { id: 'compression_issue',  label: 'Compression / Mechanical',    score: 0.25 },
  ],

  steps: [

    // ── Step 1: Cranking RPM ────────────────────────────────────────────────
    {
      id: 'cranking_rpm',
      instruction: 'Connect the OBD adapter and crank the engine for 5 seconds while watching the RPM reading.',
      question: 'Does the RPM gauge exceed ~200 RPM during cranking?',
      options: [
        {
          label: 'Yes — RPM rises above 200',
          scoreDeltas: {
            fuel_issue:         +0.05,
            ignition_issue:     +0.05,
            crank_sensor_issue: -0.20,
            compression_issue:  +0.05,
          },
          note: 'Crank sensor is communicating. Engine is cranking — focus on fuel and spark.',
        },
        {
          label: 'No — RPM stays at 0',
          scoreDeltas: {
            fuel_issue:         -0.10,
            ignition_issue:     -0.10,
            crank_sensor_issue: +0.35,
            compression_issue:  -0.05,
          },
          note: 'Zero RPM during cranking strongly suggests a crank position sensor fault or no-start at the ECU level.',
        },
        {
          label: 'Not sure / No OBD data',
          scoreDeltas: {
            fuel_issue:         0,
            ignition_issue:     0,
            crank_sensor_issue: +0.05,
            compression_issue:  0,
          },
        },
      ],
    },

    // ── Step 2: Fuel Pump Prime ─────────────────────────────────────────────
    {
      id: 'fuel_pump_prime',
      instruction: 'Turn the ignition key to ON (do not crank). Listen near the fuel tank for 2–3 seconds.',
      question: 'Do you hear the fuel pump priming (a brief whirring sound)?',
      options: [
        {
          label: 'Yes — audible prime',
          scoreDeltas: {
            fuel_issue:         -0.10,
            ignition_issue:     +0.05,
            crank_sensor_issue: 0,
            compression_issue:  +0.05,
          },
          note: 'Pump is running. Fuel delivery to the rail is likely, but pressure still needs checking.',
        },
        {
          label: 'No — silent',
          scoreDeltas: {
            fuel_issue:         +0.25,
            ignition_issue:     -0.10,
            crank_sensor_issue: -0.05,
            compression_issue:  -0.05,
          },
          note: 'No prime sound — fuel pump relay, fuse, or pump itself may have failed.',
        },
        {
          label: 'Not sure',
          scoreDeltas: {
            fuel_issue:         +0.05,
            ignition_issue:     0,
            crank_sensor_issue: 0,
            compression_issue:  0,
          },
        },
      ],
    },

    // ── Step 3: Fuel at Rail ────────────────────────────────────────────────
    {
      id: 'fuel_at_rail',
      instruction: 'Check whether fuel is reaching the fuel rail or inline filter. Use a fuel pressure gauge if available, or carefully depress the Schrader valve on the rail.',
      question: 'Is fuel reaching the engine (fuel rail / filter outlet)?',
      options: [
        {
          label: 'Yes — fuel is present',
          scoreDeltas: {
            fuel_issue:         -0.10,
            ignition_issue:     +0.05,
            crank_sensor_issue: 0,
            compression_issue:  +0.05,
          },
          note: 'Fuel is reaching the rail. Delivery path is intact — check pressure quality next.',
        },
        {
          label: 'No — no fuel at rail',
          scoreDeltas: {
            fuel_issue:         +0.30,
            ignition_issue:     -0.10,
            crank_sensor_issue: -0.10,
            compression_issue:  -0.10,
          },
          note: 'No fuel at the rail strongly indicates a fuel delivery fault — pump, relay, fuse, or blockage.',
        },
        {
          label: 'Not tested',
          scoreDeltas: {
            fuel_issue:         +0.05,
            ignition_issue:     0,
            crank_sensor_issue: 0,
            compression_issue:  0,
          },
        },
      ],
    },

    // ── Step 4: Fuel Pressure ───────────────────────────────────────────────
    {
      id: 'fuel_pressure',
      instruction: 'Connect a fuel pressure gauge to the fuel rail Schrader valve (or observe gauge reading during cranking).',
      question: 'What is the fuel pressure during cranking?',
      options: [
        {
          label: 'Strong — within spec (typically 35–65 psi)',
          scoreDeltas: {
            fuel_issue:         -0.15,
            ignition_issue:     +0.05,
            crank_sensor_issue: 0,
            compression_issue:  +0.05,
          },
          note: 'Fuel pressure is good — fuel delivery is likely not the primary cause.',
        },
        {
          label: 'Weak — below spec',
          scoreDeltas: {
            fuel_issue:         +0.20,
            ignition_issue:     -0.05,
            crank_sensor_issue: -0.05,
            compression_issue:  -0.05,
          },
          note: 'Low pressure suggests a weak pump, clogged filter, or leaking pressure regulator.',
        },
        {
          label: 'No pressure — reads zero',
          scoreDeltas: {
            fuel_issue:         +0.35,
            ignition_issue:     -0.10,
            crank_sensor_issue: -0.10,
            compression_issue:  -0.10,
          },
          note: 'Zero fuel pressure confirms a fuel delivery failure.',
        },
        {
          label: 'Not tested',
          scoreDeltas: {
            fuel_issue:         +0.03,
            ignition_issue:     0,
            crank_sensor_issue: 0,
            compression_issue:  0,
          },
        },
      ],
    },

    // ── Step 5: Injector Activity ────────────────────────────────────────────
    {
      id: 'injector_activity',
      instruction: 'Use a mechanic\'s stethoscope or a long screwdriver against each injector body while cranking. Alternatively, use a test light on the injector signal wire.',
      question: 'Are the injectors firing (clicking) during cranking?',
      options: [
        {
          label: 'Yes — clicking heard / pulse confirmed',
          scoreDeltas: {
            fuel_issue:         -0.10,
            ignition_issue:     +0.05,
            crank_sensor_issue: -0.05,
            compression_issue:  +0.05,
          },
          note: 'Injectors are receiving a signal. Fuel injection is active.',
        },
        {
          label: 'No — silent injectors',
          scoreDeltas: {
            fuel_issue:         +0.20,
            ignition_issue:     0,
            crank_sensor_issue: +0.10,
            compression_issue:  -0.05,
          },
          note: 'No injector pulse may indicate ECU not triggering — check crank sensor signal and injector fuse/relay.',
        },
        {
          label: 'Not tested',
          scoreDeltas: {
            fuel_issue:         +0.03,
            ignition_issue:     0,
            crank_sensor_issue: 0,
            compression_issue:  0,
          },
        },
      ],
    },

    // ── Step 6: Spark Check ──────────────────────────────────────────────────
    {
      id: 'spark_check',
      instruction: 'Remove one spark plug, attach to its coil lead, ground the plug body against the engine block, and crank for 5 seconds.',
      question: 'Is spark present at the plug tip?',
      options: [
        {
          label: 'Yes — visible spark',
          scoreDeltas: {
            fuel_issue:         +0.05,
            ignition_issue:     -0.20,
            crank_sensor_issue: -0.05,
            compression_issue:  +0.05,
          },
          note: 'Spark is present. Ignition system is functioning — focus shifts to fuel and compression.',
        },
        {
          label: 'No — no spark',
          scoreDeltas: {
            fuel_issue:         -0.10,
            ignition_issue:     +0.35,
            crank_sensor_issue: +0.05,
            compression_issue:  -0.05,
          },
          note: 'No spark points to ignition coil, ignition module, crank sensor signal, or ECU output fault.',
        },
        {
          label: 'Not tested',
          scoreDeltas: {
            fuel_issue:         0,
            ignition_issue:     +0.03,
            crank_sensor_issue: 0,
            compression_issue:  0,
          },
        },
      ],
    },

    // ── Step 7: Compression ──────────────────────────────────────────────────
    {
      id: 'compression_check',
      instruction: 'Remove all spark plugs. Connect a compression gauge to each cylinder in turn and crank. Record each reading. Spec is typically 150–200 psi; service limit ~100 psi.',
      question: 'What did the compression test show?',
      options: [
        {
          label: 'Normal — all cylinders within spec',
          scoreDeltas: {
            fuel_issue:         +0.05,
            ignition_issue:     +0.05,
            crank_sensor_issue: +0.05,
            compression_issue:  -0.20,
          },
          note: 'Compression is good — the mechanical foundation is intact.',
        },
        {
          label: 'Low — one or more cylinders below spec',
          scoreDeltas: {
            fuel_issue:         -0.05,
            ignition_issue:     -0.05,
            crank_sensor_issue: -0.05,
            compression_issue:  +0.35,
          },
          note: 'Low compression indicates worn rings, burnt valves, or a head gasket problem.',
        },
        {
          label: 'Not tested',
          scoreDeltas: {
            fuel_issue:         0,
            ignition_issue:     0,
            crank_sensor_issue: 0,
            compression_issue:  +0.03,
          },
        },
      ],
    },

  ],
};

export default noStartPack;
