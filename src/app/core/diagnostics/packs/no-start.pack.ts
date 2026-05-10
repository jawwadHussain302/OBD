import { KnowledgePack } from '../diagnostic-types';

// ── Score delta constants ─────────────────────────────────────────────────────
// Named constants keep the effects readable and easy to recalibrate.
// All deltas are additive on top of initialConfidence (0.25 each).

const HEAVY  = 0.40;   // Strong physical evidence pointing at this cause
const STRONG = 0.35;   // Clear symptom, very likely this cause
const MEDIUM = 0.20;   // Supporting evidence, consistent with this cause
const SLIGHT = 0.15;   // Weak corroborating signal
const REDUCE = -0.20;  // Evidence against this cause

// ── Pack definition ───────────────────────────────────────────────────────────

export const noStartPack: KnowledgePack = {
  id: 'no_start',
  title: 'No-Start / Hard-Start Diagnostic',

  // Four root causes that cover the vast majority of no-start conditions.
  // Balanced starting confidence — no cause is assumed before any evidence.
  hypotheses: [
    { id: 'fuel_issue',         initialConfidence: 0.25 },
    { id: 'ignition_issue',     initialConfidence: 0.25 },
    { id: 'crank_sensor_issue', initialConfidence: 0.25 },
    { id: 'compression_issue',  initialConfidence: 0.25 },
  ],

  steps: [

    // ── STEP 1: Cranking RPM ────────────────────────────────────────────────
    // The first and most decisive split in any no-start tree.
    // If the ECU sees no crank signal, it cannot fire injectors or coils,
    // making every other system irrelevant until the crank sensor is resolved.
    {
      id: 'cranking_rpm',
      instruction:
        'With the adapter connected, crank the engine for 3–5 seconds while watching the live RPM reading.',
      question: 'Does the RPM gauge show activity above ~200 RPM during cranking?',
      options: [
        {
          label: 'Yes — RPM rises when cranking',
          effect: {},
          // No next specified — advances automatically to fuel_pump_prime
        },
        {
          label: 'No — RPM stays at zero or barely moves',
          // Zero RPM during cranking = no crank signal reaching the ECU.
          // Could be a failed crank sensor, sheared reluctor ring, or ECU input fault.
          // Still continue the rest of the workflow — fuel/ignition may also be absent,
          // and the mechanic can use remaining steps to build a fuller picture.
          effect: { crank_sensor_issue: HEAVY },
        },
      ],
    },

    // ── STEP 2: Fuel Pump Prime ─────────────────────────────────────────────
    // The fuel pump runs for ~2 seconds on key-ON to pressurise the rail.
    // Audible prime is a quick field test for pump relay and pump health.
    {
      id: 'fuel_pump_prime',
      instruction:
        'Turn the ignition to ON (do not crank). Listen near the rear of the car — the fuel pump should hum briefly for 1–2 seconds.',
      question: 'Can you hear the fuel pump priming?',
      options: [
        {
          label: 'Yes — heard a brief hum or whir',
          effect: {},
        },
        {
          label: 'No — silence after key-ON',
          // No prime sound: pump relay, fuel pump fuse, or pump motor failure.
          effect: { fuel_issue: STRONG },
        },
        {
          label: 'Not sure — too noisy to tell',
          effect: {},
        },
      ],
    },

    // ── STEP 3: Fuel Delivery ───────────────────────────────────────────────
    // Confirms whether fuel is physically reaching the engine side of the system.
    // A "No" here is definitive for an upstream fuel problem — skip pressure
    // and injector steps since they are downstream of the confirmed fault.
    {
      id: 'fuel_delivery',
      instruction:
        'Check for fuel at the fuel rail (Schrader valve) or filter outlet with ignition ON. Use a rag to catch any spray — fire risk.',
      question: 'Is fuel reaching the engine?',
      options: [
        {
          label: 'Yes — fuel present at the rail',
          effect: {},
          // Advance to pressure test
        },
        {
          label: 'No — nothing at the rail',
          // Confirmed upstream failure (pump, filter, relay, or blocked line).
          // Skip fuel pressure and injector steps — they cannot add information
          // when we already know fuel is not reaching the engine.
          effect: { fuel_issue: STRONG },
          next: 'spark_check',
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Fuel Pressure ───────────────────────────────────────────────
    // Weak pressure is typically a failing pump, clogged filter, or leaking
    // pressure regulator. Zero pressure with audible prime suggests a regulator
    // or return-line fault (pump is running but not holding pressure).
    {
      id: 'fuel_pressure',
      instruction:
        'Fit a fuel pressure gauge to the Schrader valve on the fuel rail. Observe pressure during cranking. Typical petrol spec: 35–65 psi.',
      question: 'What is the fuel pressure during cranking?',
      options: [
        {
          label: 'Strong — within manufacturer spec',
          effect: {},
        },
        {
          label: 'Weak — below spec or dropping during crank',
          effect: { fuel_issue: MEDIUM },
        },
        {
          label: 'No pressure — gauge reads zero throughout',
          effect: { fuel_issue: HEAVY },
        },
        {
          label: 'Not tested — no gauge available',
          effect: {},
        },
      ],
    },

    // ── STEP 5: Injector Activity ───────────────────────────────────────────
    // Injectors receive their open/close signal from the ECU.
    // No pulse with fuel present means the ECU is not commanding injection —
    // commonly caused by a missing crank signal or ECU fault.
    {
      id: 'injector_activity',
      instruction:
        'Use a mechanic\'s stethoscope (or a long screwdriver handle to your ear) against each injector body while cranking. Alternatively, use a noid light on the injector harness connector.',
      question: 'Are the injectors clicking or pulsing during cranking?',
      options: [
        {
          label: 'Yes — clicking or noid light flashing',
          effect: {},
        },
        {
          label: 'No — silence or noid light dead',
          // ECU is not triggering the injectors. With fuel present this strongly
          // suggests the ECU lacks a valid crank signal to reference injection timing.
          effect: { fuel_issue: SLIGHT, crank_sensor_issue: MEDIUM },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 6: Spark Check ─────────────────────────────────────────────────
    // Spark is independent of fuel delivery — a no-spark result isolates
    // the ignition system regardless of what the fuel steps showed.
    // Keep clear of the fuel system during this test.
    {
      id: 'spark_check',
      instruction:
        'Remove one spark plug and reconnect its HT lead. Hold the plug threads against the engine block (good earth). Crank for 3 seconds and observe. Keep the plug away from the fuel rail.',
      question: 'Is spark present at the plug during cranking?',
      options: [
        {
          label: 'Yes — strong blue spark visible',
          effect: {},
        },
        {
          label: 'No — no spark or a faint orange glow only',
          // No spark: coil failure, ignition module, crank sensor (no timing reference),
          // or wiring fault. Heavy increase since absence of spark is a direct finding.
          effect: { ignition_issue: HEAVY },
        },
        {
          label: 'Not tested — access or safety concern',
          effect: {},
        },
      ],
    },

    // ── STEP 7: Compression ─────────────────────────────────────────────────
    // Last check — mechanical integrity. A car with good fuel, good spark,
    // and good crank signal that still will not start almost always has a
    // compression or timing issue. Low or uneven compression closes the loop.
    {
      id: 'compression',
      instruction:
        'Remove all spark plugs. Fit a compression gauge to each cylinder and crank 4–6 times. Note all readings. Typical petrol spec: 150–200 psi. Readings should be within 10% of each other.',
      question: 'What do the compression readings show?',
      options: [
        {
          label: 'Normal — all cylinders within spec and within 10% of each other',
          // Good compression rules out mechanical cause.
          effect: { compression_issue: REDUCE },
        },
        {
          label: 'Low or uneven — one or more cylinders below spec',
          // Worn rings, burnt valve, blown head gasket, or jumped timing chain.
          effect: { compression_issue: HEAVY },
        },
        {
          label: 'Not tested — no gauge available',
          effect: {},
          // No next → pack complete (last step in array)
        },
      ],
    },

  ],
};
