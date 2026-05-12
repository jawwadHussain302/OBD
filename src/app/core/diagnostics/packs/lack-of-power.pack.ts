import type { KnowledgePack } from '../diagnostic-types';
import { HEAVY, STRONG, MEDIUM, SLIGHT, REDUCE, SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE } from './pack-scoring';

// ── Pack definition ───────────────────────────────────────────────────────────

export const lackOfPowerPack: KnowledgePack = {
  id: 'lack_of_power',
  title: 'Lack of Power / Hesitation Diagnostic',

  // Seven root causes covering the full power-loss failure space.
  // 7 × 0.14 ≈ 0.98 — balanced starting point, no prior assumption.
  hypotheses: [
    { id: 'catalytic_converter_restriction', initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'fuel_delivery_issue',             initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'maf_sensor_issue',                initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'boost_leak_issue',                initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'ignition_under_load_issue',       initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'transmission_slip_issue',         initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'sensor_plausibility_issue',       initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
  ],

  steps: [

    // ── STEP 1: Symptom Onset Profile ───────────────────────────────────────
    // The pattern of when and how power loss occurs is the most efficient
    // first filter. RPM rising without matching acceleration is pathognomonic
    // for transmission slip. Tip-in hesitation almost always points to a sensor
    // or ignition fault rather than a mechanical restriction.
    {
      id: 'symptom_onset',
      instruction:
        'Road-test the vehicle or observe symptoms carefully. Note whether power loss is ' +
        'felt during light acceleration, hard acceleration, at steady highway speed, or on ' +
        'uphill grades. Ask whether RPM climbs normally when the pedal is applied.',
      question: 'When does the lack of power most clearly occur?',
      options: [
        {
          label: 'Hesitation or stumble immediately on tip-in (throttle opening)',
          // Tip-in stumble = delayed fuel delivery response or ignition breakdown at the
          // moment of load increase. MAF-driven fuel calc errors are a common cause.
          effect: { maf_sensor_issue: MEDIUM, ignition_under_load_issue: SLIGHT },
        },
        {
          label: 'Progressive power loss at mid- to high-RPM under load',
          // Progressive restriction above a certain RPM is the classic exhaust backpressure
          // signature — the engine cannot expel exhaust fast enough to draw in fresh charge.
          effect: { catalytic_converter_restriction: MEDIUM, fuel_delivery_issue: SLIGHT },
        },
        {
          label: 'Flat or sluggish on motorway / uphill, fine at low speed',
          // Sustained high-load deficit: fuel delivery, boost, or catalytic restriction.
          effect: { fuel_delivery_issue: MEDIUM, catalytic_converter_restriction: SLIGHT, boost_leak_issue: SLIGHT },
        },
        {
          label: 'RPM rises normally but the car does not accelerate with it',
          // RPM/speed decoupling is the one symptom that is unambiguous: transmission slip.
          effect: { transmission_slip_issue: HEAVY },
        },
        {
          label: 'Sharp cut-out or misfire only during hard acceleration',
          // Load-induced misfire / ignition breakdown under cylinder pressure.
          effect: { ignition_under_load_issue: STRONG, boost_leak_issue: SLIGHT },
        },
        {
          label: 'Not sure',
          effect: {},
        },
      ],
    },

    // ── STEP 2: DTC and Pending Code Review ─────────────────────────────────
    // The ECU often logs exactly what is wrong. Lean codes confirm a fuel or air
    // metering deficit. Catalyst efficiency codes confirm restriction. Boost codes
    // confirm a pressure loss. Sensor codes flag plausibility failures.
    {
      id: 'dtc_review',
      instruction:
        'Read all stored and pending DTCs on the scan tool. Note any codes in the following ' +
        'categories: fuel trim (P0171, P0174), catalyst efficiency (P0420, P0430), boost ' +
        'pressure (P0234, P0299), MAF/airflow (P0100–P0103), and misfire (P0300–P030X).',
      question: 'What codes are present?',
      options: [
        {
          label: 'P0171 / P0174 — System lean (Bank 1 or Bank 2)',
          // Lean codes confirm the ECU is struggling to maintain stoichiometry —
          // consistent with MAF under-reading or insufficient fuel delivery.
          effect: { maf_sensor_issue: MEDIUM, fuel_delivery_issue: MEDIUM },
        },
        {
          label: 'P0420 / P0430 — Catalyst efficiency below threshold',
          // Direct evidence of a degraded or blocked catalytic converter.
          effect: { catalytic_converter_restriction: STRONG },
        },
        {
          label: 'P0234 / P0299 — Boost overrun / underboost',
          // Boost-related codes directly implicate the turbocharger or intercooler circuit.
          effect: { boost_leak_issue: STRONG },
        },
        {
          label: 'P0100–P0103 / P0113 — MAF or IAT sensor fault',
          // Sensor codes flag plausibility or range failures in air charge measurement.
          effect: { maf_sensor_issue: MEDIUM, sensor_plausibility_issue: MEDIUM },
        },
        {
          label: 'P0300–P030X — Misfire under load',
          // Misfire codes during high-load operation: ignition coil breakdown or lean misfire.
          effect: { ignition_under_load_issue: MEDIUM },
        },
        {
          label: 'No codes stored',
          // Absence of codes makes a plausibility / sensor fault less likely — the ECU
          // does not see a measurable fault, so the problem is likely physical/mechanical.
          effect: { sensor_plausibility_issue: REDUCE },
        },
        {
          label: 'Not checked',
          effect: {},
        },
      ],
    },

    // ── STEP 3: Fuel Trims and MAF Under Load ───────────────────────────────
    // Live data during a road test or load simulation is the most diagnostic
    // data point. LTFT persistently positive at cruise means chronic lean mixture.
    // MAF dropping or hesitating during acceleration exposes a contaminated sensor
    // or an air leak that only opens under the pressure differential of acceleration.
    {
      id: 'live_data_under_load',
      instruction:
        'Using a scan tool, observe LTFT Bank 1 and MAF (g/s) during a steady cruise at 50–60 mph ' +
        'and during a moderate acceleration pull. Normal: LTFT within ±10%, MAF rises smoothly ' +
        'with throttle and holds proportionally to RPM.',
      question: 'What do live fuel trims and MAF show under load?',
      options: [
        {
          label: 'LTFT above +10% at cruise — persistent lean correction',
          // Long-term lean at cruise points to either unmetered air (MAF error) or insufficient fuel.
          effect: { maf_sensor_issue: MEDIUM, fuel_delivery_issue: MEDIUM },
        },
        {
          label: 'MAF drops, hesitates, or does not rise smoothly during acceleration',
          // A MAF signal that lags or dips under throttle application causes a fuelling stumble.
          effect: { maf_sensor_issue: STRONG, sensor_plausibility_issue: SLIGHT },
        },
        {
          label: 'Both normal — trims within ±10% and MAF tracks cleanly',
          // Normal live data rules out MAF contamination and gross fuel delivery deficits.
          effect: { maf_sensor_issue: REDUCE, fuel_delivery_issue: SLIGHT },
        },
        {
          label: 'Not checked — no scan tool or unable to road-test',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Intake and Boost Hose Inspection ─────────────────────────────
    // An air leak between the MAF sensor and the throttle body admits unmetered
    // air, causing lean mixture that worsens under the increased vacuum of acceleration.
    // On turbocharged vehicles, a split charge-pipe or intercooler hose bleeds boost
    // pressure precisely when it is needed most — under full throttle.
    {
      id: 'intake_boost_inspection',
      instruction:
        'With the engine off, inspect all hoses between the air filter and the throttle body ' +
        'for cracks, loose clamps, or collapse marks. On turbocharged vehicles, inspect all ' +
        'intercooler pipes and hose joints — pay attention to bends and clamp areas. ' +
        'Run the engine and listen for a hissing or flutter noise under a snap throttle.',
      question: 'What did the inspection reveal?',
      options: [
        {
          label: 'Split, cracked, or loose intake hose between MAF and throttle body',
          // Unmetered air bypasses the MAF — ECU under-fuels and the engine runs lean under load.
          effect: { maf_sensor_issue: MEDIUM, boost_leak_issue: SLIGHT },
        },
        {
          label: 'Boost pipe split, loose clamp, or intercooler hose displaced (turbocharged)',
          // Boost leaks collapse under full throttle — the turbo cannot build target pressure.
          effect: { boost_leak_issue: STRONG },
        },
        {
          label: 'No leaks found — all hoses and clamps secure',
          effect: { boost_leak_issue: REDUCE },
        },
        {
          label: 'Not applicable / not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 5: Exhaust Restriction Assessment ──────────────────────────────
    // A clogged catalytic converter acts as a physical restriction that limits
    // exhaust flow. The engine breathes freely at low RPM but runs out of exhaust
    // exit capacity at high RPM, creating a characteristic power plateau or sudden
    // cut-off. A backpressure test at the oxygen sensor port is definitive.
    {
      id: 'exhaust_restriction',
      instruction:
        'Remove the upstream O2 sensor from the exhaust (before the catalytic converter). ' +
        'Fit a backpressure gauge to the port — acceptable: <3 psi at idle, <10 psi at 2500 RPM. ' +
        'Without a gauge, observe whether removing the sensor at idle noticeably increases idle ' +
        'quality or whether the cat glows red after a short drive (severe blockage).',
      question: 'What does exhaust restriction testing reveal?',
      options: [
        {
          label: 'High backpressure measured — above spec at RPM',
          effect: { catalytic_converter_restriction: HEAVY },
        },
        {
          label: 'Power improves with O2 sensor removed — exhaust clearly restricted',
          effect: { catalytic_converter_restriction: STRONG },
        },
        {
          label: 'No restriction detected — backpressure within spec',
          effect: { catalytic_converter_restriction: REDUCE },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 6: Fuel Pressure Under Load ────────────────────────────────────
    // Fuel pressure that holds at idle can still collapse under the high fuel
    // demand of wide-open throttle. A pump nearing end-of-life may deliver
    // adequate idle pressure but cannot sustain volume at high flow rates.
    {
      id: 'fuel_pressure_under_load',
      instruction:
        'Fit a fuel pressure gauge and observe readings during a hard acceleration pull ' +
        '(or while a helper holds the engine at 3000–4000 RPM against a load). ' +
        'Pressure should remain stable within the manufacturer spec — a drop of more than ' +
        '5–10 psi under load indicates a weak pump, clogged filter, or deficient fuel supply.',
      question: 'What does fuel pressure show under load?',
      options: [
        {
          label: 'Pressure drops significantly under load or at high RPM',
          effect: { fuel_delivery_issue: HEAVY },
        },
        {
          label: 'Pressure stable throughout — holds within spec under load',
          effect: { fuel_delivery_issue: REDUCE },
        },
        {
          label: 'Not tested — no gauge available',
          effect: {},
        },
      ],
    },

    // ── STEP 7: Ignition Performance Under Load ──────────────────────────────
    // Ignition coils that function adequately at idle can arc to ground or fail
    // to fire under the higher cylinder pressures of hard acceleration. Worn
    // spark plugs with wide gaps demand more coil energy to bridge — the first
    // symptom is always misfire or hesitation only during acceleration.
    {
      id: 'ignition_under_load',
      instruction:
        'Inspect spark plugs for electrode wear, wide gaps, or glazing. ' +
        'Check coil-on-plug boots for cracking or carbon tracking (arcing to the spark plug tube). ' +
        'If possible, connect a scan tool and observe for load-induced misfire counts that do not ' +
        'appear at idle.',
      question: 'What does ignition inspection reveal?',
      options: [
        {
          label: 'Plugs heavily worn or coil boots cracked / arcing marks visible',
          effect: { ignition_under_load_issue: STRONG },
        },
        {
          label: 'Misfire counts appear only during acceleration on the scan tool',
          // Load-induced misfire without idle misfire is the fingerprint of ignition breakdown
          // under cylinder pressure — coils or plugs that cannot fire at compression peak.
          effect: { ignition_under_load_issue: HEAVY },
        },
        {
          label: 'Plugs look serviceable, no arcing, no load-specific misfire',
          effect: { ignition_under_load_issue: REDUCE },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 8: Transmission Slip Assessment ────────────────────────────────
    // Transmission slip is distinguished from engine power loss by the
    // relationship between engine RPM and vehicle speed. If the engine revs
    // climb freely but the car does not accelerate, the drivetrain — not the
    // engine — is absorbing the power. Automatic slip is often torque-converter
    // clutch failure at light load; full-slip is a clutch pack or band failure.
    {
      id: 'transmission_assessment',
      instruction:
        'During a steady pull in a higher gear, observe whether engine RPM flares upward ' +
        'without a corresponding increase in vehicle speed. On a manual: check for clutch ' +
        'slip under load (high RPM, low acceleration). On an automatic: note any shudder ' +
        'at light throttle in top gear (torque converter clutch slip).',
      question: 'How does RPM relate to vehicle acceleration under load?',
      options: [
        {
          label: 'RPM rises freely but vehicle does not accelerate — clear slip',
          // RPM/speed decoupling under load is definitive for transmission slip.
          effect: { transmission_slip_issue: HEAVY },
        },
        {
          label: 'Shudder or judder under light throttle in top gear (automatic)',
          // Torque converter clutch shudder is a common symptom of worn TCC friction material.
          effect: { transmission_slip_issue: MEDIUM },
        },
        {
          label: 'RPM and acceleration track together — no slip detected',
          effect: { transmission_slip_issue: REDUCE },
        },
        {
          label: 'Not assessed',
          effect: {},
          // No next → pack complete
        },
      ],
    },

  ],
};
