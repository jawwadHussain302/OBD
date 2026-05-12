import { KnowledgePack } from '../diagnostic-types';

// ── Score delta constants ─────────────────────────────────────────────────────
const HEAVY  = 0.40;   // Strong physical measurement pointing at this cause
const STRONG = 0.35;   // Clear symptom, very likely this cause
const MEDIUM = 0.20;   // Supporting evidence, consistent with this cause
const SLIGHT = 0.15;   // Weak corroborating signal
const REDUCE = -0.20;  // Evidence against this cause

// ── Pack definition ───────────────────────────────────────────────────────────

export const batteryChargingPack: KnowledgePack = {
  id: 'battery_charging',
  title: 'Battery / Charging System Diagnostic',

  // Seven root causes covering the full charging system.
  // Balanced starting confidence — no cause assumed before evidence.
  hypotheses: [
    { id: 'battery_failure_issue',  initialConfidence: 0.25 },
    { id: 'alternator_issue',       initialConfidence: 0.25 },
    { id: 'terminal_connection_issue', initialConfidence: 0.25 },
    { id: 'ground_issue',           initialConfidence: 0.25 },
    { id: 'parasitic_drain_issue',  initialConfidence: 0.25 },
    { id: 'starter_draw_issue',     initialConfidence: 0.25 },
    { id: 'drive_belt_issue',       initialConfidence: 0.25 },
  ],

  steps: [

    // ── STEP 1: Symptom confirmation ────────────────────────────────────────
    // Triage the presenting complaint to focus scoring before any measurements.
    // Repeated dead battery overnight is the strongest early signal for
    // parasitic drain; slow/laboured cranking points to battery or starter.
    {
      id: 'symptom_confirm',
      instruction:
        'Before measuring anything, note what the driver is complaining about.',
      question: 'What is the primary symptom?',
      options: [
        {
          label: 'Slow or laboured cranking',
          // Weak crank = battery discharged or starter drawing excessive current.
          effect: { battery_failure_issue: MEDIUM, starter_draw_issue: SLIGHT },
        },
        {
          label: 'Battery warning light on dash',
          // Charge light = alternator not maintaining voltage.
          effect: { alternator_issue: STRONG },
        },
        {
          label: 'Battery goes flat overnight / repeatedly',
          // Repeated discharge with no alternator fault = classic parasitic drain.
          effect: { parasitic_drain_issue: STRONG },
        },
        {
          label: 'Dim lights or flickering electrics',
          // Low system voltage under load: alternator undercharging or poor ground.
          effect: { alternator_issue: MEDIUM, ground_issue: MEDIUM },
        },
      ],
    },

    // ── STEP 2: Resting battery voltage ────────────────────────────────────
    // Measured with engine OFF, all accessories off, battery rested ≥ 2 min.
    // A healthy 12 V battery holds 12.6 V at full charge; below 12.0 V = deeply
    // discharged or failed cell.
    {
      id: 'battery_voltage_off',
      instruction:
        'Set a multimeter to DC volts. Measure across the battery terminals with the engine OFF and all accessories switched off. Let the battery rest at least 2 minutes first.',
      question: 'What is the resting battery voltage?',
      options: [
        {
          label: '12.5 V or above — good charge',
          effect: { battery_failure_issue: REDUCE },
        },
        {
          label: '12.0–12.4 V — partially discharged',
          effect: { battery_failure_issue: SLIGHT },
        },
        {
          label: 'Below 12.0 V — heavily discharged or failed',
          effect: { battery_failure_issue: HEAVY },
        },
        {
          label: 'Not tested — no multimeter available',
          effect: {},
        },
      ],
    },

    // ── STEP 3: Charging voltage ────────────────────────────────────────────
    // Start the engine and measure voltage at the battery. A healthy alternator
    // holds 13.8–14.7 V. Above 15 V = overcharging (faulty regulator).
    // Below 13.5 V = undercharging (worn brushes, slipping belt, failed diode pack).
    {
      id: 'charging_voltage',
      instruction:
        'Keep the multimeter connected across the battery terminals. Start the engine and let it idle. Switch on headlights and fan to put the alternator under load.',
      question: 'What does the voltmeter read with the engine running?',
      options: [
        {
          label: '13.8–14.7 V — normal charging',
          effect: { alternator_issue: REDUCE, drive_belt_issue: REDUCE },
        },
        {
          label: '13.5 V or below — undercharging',
          effect: { alternator_issue: STRONG, drive_belt_issue: MEDIUM },
        },
        {
          label: '15.0 V or above — overcharging',
          // High voltage = failed voltage regulator inside alternator.
          effect: { alternator_issue: HEAVY },
        },
        {
          label: 'Voltage drops below battery resting voltage',
          // Engine running but voltage drops = alternator not contributing at all.
          effect: { alternator_issue: HEAVY, drive_belt_issue: STRONG },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Terminal and ground inspection ──────────────────────────────
    // Loose, corroded, or undersized grounds cause voltage drop that looks like
    // alternator or battery failure. Inspect both battery terminals and the
    // engine/body ground straps.
    {
      id: 'terminal_ground_check',
      instruction:
        'Inspect both battery terminals for corrosion (white/blue powder), looseness, or damaged clamps. Also trace the negative cable to the engine block and body ground straps — check for looseness or corrosion at those bolts.',
      question: 'What did the terminal and ground inspection show?',
      options: [
        {
          label: 'All clean and tight',
          effect: { terminal_connection_issue: REDUCE, ground_issue: REDUCE },
        },
        {
          label: 'Corrosion on battery terminals',
          effect: { terminal_connection_issue: STRONG },
        },
        {
          label: 'Loose terminal clamp(s)',
          effect: { terminal_connection_issue: HEAVY },
        },
        {
          label: 'Loose or corroded ground strap (engine or body)',
          effect: { ground_issue: HEAVY },
        },
      ],
    },

    // ── STEP 5: Drive belt condition ────────────────────────────────────────
    // A slipping or broken serpentine/drive belt stops the alternator spinning
    // at the correct speed, causing undercharge even if the alternator is healthy.
    {
      id: 'drive_belt_condition',
      instruction:
        'With the engine OFF, inspect the serpentine or alternator drive belt visually and by hand. Look for cracks, fraying, glazing (shiny surface), or obvious slack.',
      question: 'What is the drive belt condition?',
      options: [
        {
          label: 'Good — no visible wear, correct tension',
          effect: { drive_belt_issue: REDUCE },
        },
        {
          label: 'Cracked, frayed, or glazed',
          effect: { drive_belt_issue: STRONG },
        },
        {
          label: 'Slack or slipping (squealing noise at startup)',
          // Slipping belt = alternator under-spun, output voltage low.
          effect: { drive_belt_issue: HEAVY, alternator_issue: SLIGHT },
        },
        {
          label: 'Not checked — access difficult',
          effect: {},
        },
      ],
    },

    // ── STEP 6: Cranking voltage drop ──────────────────────────────────────
    // Measures how much voltage the battery loses under starter load.
    // A large drop (below 9.6 V) on a fully charged battery means either the
    // battery is failing internally, the starter is drawing excessive current,
    // or a poor connection is adding resistance.
    {
      id: 'cranking_voltage_drop',
      instruction:
        'With the multimeter still on the battery terminals, crank the engine for 3–5 seconds (disable ignition or fuel pump if needed to prevent start). Watch the lowest voltage reading during cranking.',
      question: 'What is the lowest voltage seen during cranking?',
      options: [
        {
          label: '10.0 V or above — acceptable drop',
          effect: { battery_failure_issue: REDUCE, starter_draw_issue: REDUCE },
        },
        {
          label: '9.6–10.0 V — borderline',
          effect: { battery_failure_issue: SLIGHT, starter_draw_issue: SLIGHT },
        },
        {
          label: 'Below 9.6 V — excessive drop',
          // Either battery can't sustain load, or starter drawing too much current,
          // or terminal/ground resistance robbing voltage.
          effect: {
            battery_failure_issue: STRONG,
            starter_draw_issue: MEDIUM,
            terminal_connection_issue: SLIGHT,
          },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 7: Parasitic drain check ───────────────────────────────────────
    // Only relevant when the battery repeatedly discharges without obvious cause.
    // Normal parasitic draw ≤ 50 mA with all accessories off and modules in sleep.
    // Above 100 mA sustained = something is staying awake (relay, module, short).
    {
      id: 'parasitic_drain',
      instruction:
        'Connect a multimeter set to mA (DC current) in series with the negative battery cable, with all doors closed and accessories off. Wait 10 minutes for modules to sleep, then read current draw.',
      question: 'What is the measured parasitic current draw?',
      options: [
        {
          label: 'Under 50 mA — normal',
          effect: { parasitic_drain_issue: REDUCE },
        },
        {
          label: '50–100 mA — slightly elevated',
          effect: { parasitic_drain_issue: MEDIUM },
        },
        {
          label: 'Over 100 mA — high drain confirmed',
          effect: { parasitic_drain_issue: HEAVY },
        },
        {
          label: 'Not tested — battery not repeatedly discharging',
          effect: {},
        },
      ],
    },

  ],
};
