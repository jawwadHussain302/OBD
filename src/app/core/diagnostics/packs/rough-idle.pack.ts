import { KnowledgePack } from '../diagnostic-types';

// ── Score delta constants ─────────────────────────────────────────────────────
// Identical magnitude scale to no-start and misfire packs for consistency.

const HEAVY  =  0.40;   // Definitive or measurement-confirmed finding
const STRONG =  0.35;   // Direct observation strongly implicating this cause
const MEDIUM =  0.20;   // Supporting evidence consistent with this cause
const SLIGHT =  0.15;   // Weak corroborating signal
const REDUCE = -0.20;   // Evidence against this cause

// ── Pack definition ───────────────────────────────────────────────────────────

export const roughIdlePack: KnowledgePack = {
  id: 'rough_idle',
  title: 'Rough Idle / Stalling Diagnostic',

  // Seven root causes covering the full rough-idle failure space.
  // 7 × 0.14 ≈ 0.98 — balanced starting point, no prior assumption.
  hypotheses: [
    { id: 'vacuum_leak_issue',   initialConfidence: 0.14 },
    { id: 'throttle_body_issue', initialConfidence: 0.14 },
    { id: 'idle_control_issue',  initialConfidence: 0.14 },
    { id: 'maf_sensor_issue',    initialConfidence: 0.14 },
    { id: 'fuel_delivery_issue', initialConfidence: 0.14 },
    { id: 'egr_issue',           initialConfidence: 0.14 },
    { id: 'compression_issue',   initialConfidence: 0.14 },
  ],

  steps: [

    // ── STEP 1: Idle Symptom Profile ────────────────────────────────────────
    // The symptom pattern narrows the field before any physical testing begins.
    // Hunting idle → air management (vacuum leak, IAC, throttle body).
    // Stalling → fuel delivery or idle control.
    // Rough/lumpy → individual cylinder issue (compression, injector).
    // Worsens when hot → EGR stuck open is a classic warm-idle degrader.
    {
      id: 'idle_symptom_profile',
      instruction:
        'Observe the idle behaviour with the engine fully warm. Note any RPM variation, ' +
        'whether the issue worsens at operating temperature, and whether the engine stalls.',
      question: 'Which best describes the idle symptom?',
      options: [
        {
          label: 'Hunting or surging — RPM rises and falls rhythmically',
          // Rhythmic hunting is the hallmark of an air leak or IAC fighting to maintain idle.
          effect: { vacuum_leak_issue: SLIGHT, idle_control_issue: SLIGHT },
        },
        {
          label: 'Low but steady — RPM sits below normal spec',
          // Steady low idle without hunting points to restricted airflow or partial throttle fouling.
          effect: { throttle_body_issue: SLIGHT, fuel_delivery_issue: SLIGHT },
        },
        {
          label: 'Stalls at idle or when coming to a stop',
          // Stalling at idle = engine cannot sustain combustion; fuel delivery or IAC most likely.
          effect: { idle_control_issue: MEDIUM, fuel_delivery_issue: MEDIUM },
        },
        {
          label: 'Rough or lumpy — random misfires at idle',
          // Lumpy idle suggests a cylinder-specific fault rather than a global air/fuel issue.
          effect: { compression_issue: SLIGHT, maf_sensor_issue: SLIGHT },
        },
        {
          label: 'Worsens when warm — fine when cold, rough after heat soak',
          // EGR valves that stick open at operating temperature are a classic cause of warm rough idle.
          effect: { egr_issue: MEDIUM, vacuum_leak_issue: SLIGHT },
        },
        {
          label: 'Not sure',
          effect: {},
        },
      ],
    },

    // ── STEP 2: Vacuum Line and Intake Hose Inspection ──────────────────────
    // Vacuum leaks introduce unmetered air that leans out the mixture and
    // destabilises idle. A smoke machine is the most reliable method; propane
    // or carb cleaner at idle is a practical field alternative.
    {
      id: 'vacuum_inspection',
      instruction:
        'Inspect all vacuum hoses, the intake boot between the air filter and throttle body, ' +
        'and the intake manifold gaskets for cracks, splits, or loose connections. ' +
        'With the engine idling, spray carb cleaner or propane near suspect joints — ' +
        'an RPM change indicates an air leak. A smoke machine fed into the intake is definitive.',
      question: 'Was an air or vacuum leak found?',
      options: [
        {
          label: 'Yes — crack, split hose, or loose connection found',
          effect: { vacuum_leak_issue: STRONG },
        },
        {
          label: 'No — all hoses and gaskets appear intact, no RPM change',
          effect: { vacuum_leak_issue: REDUCE },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 3: Fuel Trim Check at Idle ─────────────────────────────────────
    // Short-term and long-term fuel trims are the ECU's real-time record of how
    // hard it is correcting the mixture. Positive trims (>+10%) mean the engine
    // is running lean — vacuum leak or MAF under-reading. Negative trims (<-10%)
    // mean rich — excessive fuel delivery or EGR contamination.
    {
      id: 'fuel_trim_check',
      instruction:
        'With the engine fully warm and at idle, read STFT Bank 1 and LTFT Bank 1 on the scan tool. ' +
        'Acceptable range: ±10%. Readings persistently above +10% indicate a lean condition; ' +
        'below -10% indicate a rich condition.',
      question: 'What do the fuel trim readings show at idle?',
      options: [
        {
          label: 'Lean — STFT or LTFT above +10%',
          // Lean correction at idle is the most common fuel trim finding with vacuum leaks
          // and MAF contamination, both of which cause unmetered air ingestion.
          effect: { vacuum_leak_issue: MEDIUM, maf_sensor_issue: MEDIUM },
        },
        {
          label: 'Normal — both STFT and LTFT within ±10%',
          // Normal trims at idle strongly reduce the likelihood of an air leak or MAF fault.
          effect: { vacuum_leak_issue: REDUCE, maf_sensor_issue: REDUCE },
        },
        {
          label: 'Rich — STFT or LTFT below -10%',
          // Rich condition: excess fuel or exhaust gas recirculation contaminating the intake.
          effect: { fuel_delivery_issue: SLIGHT, egr_issue: SLIGHT },
        },
        {
          label: 'Not checked — no scan tool available',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Throttle Body Inspection ────────────────────────────────────
    // Carbon deposits in the throttle bore restrict airflow and can cause the
    // plate to stick. An IAC (idle air control) passage clogged with deposits
    // starves idle airflow independently of the main bore.
    {
      id: 'throttle_body_inspection',
      instruction:
        'Remove the intake hose from the throttle body. Inspect the bore and plate for heavy ' +
        'carbon deposits or oil contamination. Also check the IAC port if accessible. ' +
        'If dirty, clean with throttle body cleaner and a lint-free cloth, then retest.',
      question: 'What did the throttle body inspection reveal?',
      options: [
        {
          label: 'Heavy carbon or oil deposits — plate barely visible or sticky',
          effect: { throttle_body_issue: STRONG },
        },
        {
          label: 'Light deposits cleaned — idle improved after cleaning',
          effect: { throttle_body_issue: MEDIUM },
        },
        {
          label: 'Clean — no significant deposits',
          effect: { throttle_body_issue: REDUCE },
        },
        {
          label: 'Not inspected',
          effect: {},
        },
      ],
    },

    // ── STEP 5: MAF Sensor Reading ───────────────────────────────────────────
    // A contaminated or failing MAF under-reports airflow, causing the ECU to
    // supply insufficient fuel and produce a rough or low idle. Compare the live
    // g/s reading against the expected value for the engine displacement at idle
    // (rule of thumb: ~0.8–1.0 g/s per litre of displacement at warm idle).
    {
      id: 'maf_reading',
      instruction:
        'Read the MAF sensor output in g/s on the scan tool with the engine warm at idle. ' +
        'Raise RPM slightly to ~2000 RPM and observe the response — the reading should increase ' +
        'smoothly and proportionally. Contaminated sensors often show low readings or erratic jumps. ' +
        'If suspect, clean with dedicated MAF sensor cleaner (do not use carb cleaner).',
      question: 'How does the MAF sensor reading behave?',
      options: [
        {
          label: 'Low at idle — below expected range for the engine size',
          // Under-reading MAF causes lean fuel delivery and rough idle.
          effect: { maf_sensor_issue: STRONG },
        },
        {
          label: 'Erratic or jumpy — reading fluctuates at steady idle',
          // Erratic signal: damaged wire, contaminated sensor element, or air leak upstream.
          effect: { maf_sensor_issue: MEDIUM, vacuum_leak_issue: SLIGHT },
        },
        {
          label: 'Normal — reading within range, responds cleanly to rev',
          effect: { maf_sensor_issue: REDUCE },
        },
        {
          label: 'Not checked — no scan tool available',
          effect: {},
        },
      ],
    },

    // ── STEP 6: EGR Valve Operation ──────────────────────────────────────────
    // An EGR valve that sticks open at idle recirculates exhaust gas into the
    // intake at the wrong time, diluting the air/fuel charge and causing rough
    // or lumpy idle — particularly noticeable when the engine reaches operating
    // temperature. Common on high-mileage engines with coked-up EGR passages.
    {
      id: 'egr_check',
      instruction:
        'If the vehicle is equipped with EGR: with the engine warm at idle, briefly block the ' +
        'EGR vacuum hose or electrically disconnect the EGR solenoid. A rough idle that improves ' +
        'confirms the EGR is flowing at idle when it should be closed. Inspect the valve and ' +
        'passage for carbon build-up.',
      question: 'What did EGR testing reveal?',
      options: [
        {
          label: 'EGR stuck open or flowing at idle — blocking it improved idle',
          effect: { egr_issue: STRONG },
        },
        {
          label: 'EGR operating correctly or idle unchanged when blocked',
          effect: { egr_issue: REDUCE },
        },
        {
          label: 'Not equipped with EGR / not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 7: Fuel Pressure Check ──────────────────────────────────────────
    // Marginal fuel pressure causes lean mixture at idle, leaning out further
    // under any load. A dropping pressure during idle indicates a worn pump,
    // clogged filter, or leaking pressure regulator.
    {
      id: 'fuel_pressure_check',
      instruction:
        'Connect a fuel pressure gauge to the Schrader valve on the fuel rail. ' +
        'Record pressure at idle (typical petrol spec: 35–65 psi). Note any drop during a ' +
        'brief snap-throttle test. Pressure should hold when the engine is switched off ' +
        '(leaking injectors or a faulty regulator will cause it to bleed down quickly).',
      question: 'What does fuel pressure show at idle?',
      options: [
        {
          label: 'Low — below manufacturer spec or drops under light load',
          effect: { fuel_delivery_issue: HEAVY },
        },
        {
          label: 'Normal — within spec, holds after engine off',
          effect: { fuel_delivery_issue: REDUCE },
        },
        {
          label: 'Not tested — no gauge available',
          effect: {},
        },
      ],
    },

    // ── STEP 8: Compression Test ─────────────────────────────────────────────
    // If all air, fuel, and sensor checks are negative, low or uneven compression
    // is the remaining mechanical explanation for rough idle. A cylinder with
    // notably lower compression than its neighbours produces a lumpy, uneven idle
    // that no amount of tuning can resolve.
    {
      id: 'compression_test',
      instruction:
        'Remove all spark plugs. Fit a compression gauge to each cylinder and crank 4–6 times. ' +
        'Compare readings — all cylinders should be within 10% of each other. ' +
        'Typical petrol spec: 150–200 psi. A wet test (add a small amount of oil) helps ' +
        'differentiate ring wear from valve problems.',
      question: 'What do the compression readings show?',
      options: [
        {
          label: 'Low or uneven — one or more cylinders noticeably below others',
          effect: { compression_issue: HEAVY },
        },
        {
          label: 'Normal — all cylinders within spec and within 10% of each other',
          // Good compression across all cylinders definitively rules out a mechanical cause.
          effect: { compression_issue: REDUCE },
        },
        {
          label: 'Not tested — no compression gauge available',
          effect: {},
          // No next → pack complete
        },
      ],
    },

  ],
};
