import type { KnowledgePack } from '../diagnostic-types';
import { HEAVY, STRONG, MEDIUM, SLIGHT, REDUCE, SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE } from './pack-scoring';

// ── Pack definition ───────────────────────────────────────────────────────────

export const evReducedPowerPack: KnowledgePack = {
  id: 'ev_reduced_power',
  title: 'EV Reduced Power / Charging Fault Diagnostic',

  // Seven root causes covering the high-voltage traction battery, inverter,
  // onboard charger, and charge connection systems.
  // Balanced starting confidence — no cause assumed before evidence.
  //
  // ⚠ HIGH-VOLTAGE SAFETY: Always confirm the HV system is de-energised before
  // touching orange-cabled components. Follow manufacturer HV isolation procedure.
  hypotheses: [
    { id: 'battery_thermal_issue',     initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'low_soc_or_soh_issue',      initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'cell_imbalance_issue',       initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'inverter_overheat_issue',   initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'onboard_charger_issue',     initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'charge_connection_issue',   initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
    { id: 'hv_isolation_issue',        initialConfidence: SEVEN_HYPOTHESIS_INITIAL_CONFIDENCE },
  ],

  steps: [

    // ── STEP 1: Symptom confirmation ────────────────────────────────────────
    // Triage the complaint before any live data is read. Reduced power / turtle
    // mode is a different failure tree from charging failure, and an isolation
    // warning is a safety-first situation requiring HV protocol.
    {
      id: 'symptom_confirm',
      instruction:
        '⚠ Do not touch orange HV cables until the system is confirmed de-energised per manufacturer procedure.\n\nAsk the driver about the presenting complaint.',
      question: 'What is the primary symptom?',
      options: [
        {
          label: 'Reduced power / turtle mode — car drives but is sluggish',
          // Thermal limiting, low SOC, cell imbalance, or inverter overheat
          // are all common causes of power derating.
          effect: {
            battery_thermal_issue: MEDIUM,
            low_soc_or_soh_issue: MEDIUM,
            inverter_overheat_issue: MEDIUM,
          },
        },
        {
          label: 'Car will not charge — charger or cable shows fault',
          effect: { onboard_charger_issue: STRONG, charge_connection_issue: STRONG },
        },
        {
          label: 'EV / battery warning light on with no clear power loss',
          // Warning without driveability impact: likely early-stage imbalance,
          // SOH degradation, or a latent isolation fault being flagged by BMS.
          effect: {
            cell_imbalance_issue: MEDIUM,
            low_soc_or_soh_issue: MEDIUM,
            hv_isolation_issue: SLIGHT,
          },
        },
        {
          label: 'HV isolation warning or orange lightning bolt on dash',
          // Isolation fault is an immediate HV safety event — all further work
          // must follow strict HV isolation procedure before diagnosis continues.
          effect: { hv_isolation_issue: HEAVY },
        },
      ],
    },

    // ── STEP 2: DTC and warning scan ────────────────────────────────────────
    // EV-specific fault codes from the BMS, inverter, and OBC are the most
    // direct diagnostic evidence. Many EV platforms expose these via OBD2 Mode
    // 19 or manufacturer-specific PIDs. Record all codes before clearing.
    {
      id: 'dtc_scan',
      instruction:
        'Connect the OBD2 adapter and read all stored, pending, and permanent fault codes from every module (BMS, inverter, OBC, charge port). Note any codes related to HV isolation, cell voltage, temperature, or charge system.',
      question: 'What fault codes or warnings are present?',
      options: [
        {
          label: 'BMS cell voltage or imbalance fault (e.g. P0A80, P0A7F, P1E00)',
          effect: { cell_imbalance_issue: HEAVY, low_soc_or_soh_issue: MEDIUM },
        },
        {
          label: 'Battery over-temperature or thermal management fault',
          effect: { battery_thermal_issue: HEAVY },
        },
        {
          label: 'Inverter or motor temperature / drive fault',
          effect: { inverter_overheat_issue: HEAVY },
        },
        {
          label: 'Onboard charger or EVSE communication fault (e.g. P0C73, P1C10)',
          effect: { onboard_charger_issue: HEAVY, charge_connection_issue: MEDIUM },
        },
        {
          label: 'HV isolation fault (e.g. P0AA6, P0A0D)',
          // Isolation fault codes are safety-critical — do not continue with
          // HV-adjacent steps until isolation is confirmed good.
          effect: { hv_isolation_issue: HEAVY },
        },
        {
          label: 'No relevant EV codes — generic or no codes found',
          effect: {
            low_soc_or_soh_issue: SLIGHT,
            charge_connection_issue: SLIGHT,
          },
        },
      ],
    },

    // ── STEP 3: SOC, SOH, and battery temperature ───────────────────────────
    // State of Charge (SOC) and State of Health (SOH) are fundamental EV
    // battery metrics. High temperature at rest means the thermal management
    // system is struggling or ambient conditions are extreme. SOH below 75–80 %
    // on a high-mileage pack often triggers derating to protect remaining cells.
    {
      id: 'soc_soh_temp',
      instruction:
        'Using live data or BMS-specific diagnostics, read: battery SOC (%), SOH (% of original capacity), battery inlet/outlet coolant temperature or cell temperature (°C).',
      question: 'What do the SOC, SOH, and temperature readings show?',
      options: [
        {
          label: 'SOC above 20 %, SOH above 80 %, temperature within normal range',
          effect: {
            battery_thermal_issue: REDUCE,
            low_soc_or_soh_issue: REDUCE,
          },
        },
        {
          label: 'SOC very low (below 10–15 %) — pack nearly depleted',
          // Expected derating behaviour — charge the vehicle and retest.
          effect: { low_soc_or_soh_issue: STRONG },
        },
        {
          label: 'SOH below 75 % — significant capacity degradation',
          effect: { low_soc_or_soh_issue: HEAVY, cell_imbalance_issue: MEDIUM },
        },
        {
          label: 'Battery temperature elevated (> 40 °C at rest, or > 50 °C under load)',
          // Thermal throttling: BMS derate power to prevent cell damage.
          effect: { battery_thermal_issue: HEAVY },
        },
        {
          label: 'Data not available on this scan tool',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Cell voltage imbalance ──────────────────────────────────────
    // Individual cell or module voltages should be within ~20–50 mV of each
    // other on a healthy pack. A wide spread (> 100 mV at rest) indicates a
    // weak or failing cell group that limits the usable capacity of the whole pack.
    {
      id: 'cell_imbalance',
      instruction:
        'Using BMS live data or a manufacturer-specific scan tool, read individual cell or module voltages. Compare the highest and lowest readings across the pack.',
      question: 'What does the cell voltage spread show?',
      options: [
        {
          label: 'Balanced — all cells within 50 mV of each other',
          effect: { cell_imbalance_issue: REDUCE },
        },
        {
          label: 'Mild imbalance — spread of 50–100 mV',
          effect: { cell_imbalance_issue: MEDIUM },
        },
        {
          label: 'Significant imbalance — spread > 100 mV, one or more low outliers',
          // One weak cell group limits the whole pack; BMS cuts power when the
          // weakest cell hits its minimum voltage, even if others are charged.
          effect: { cell_imbalance_issue: HEAVY, low_soc_or_soh_issue: MEDIUM },
        },
        {
          label: 'Cell data not accessible on this tool',
          effect: {},
        },
      ],
    },

    // ── STEP 5: Inverter / motor temperature ────────────────────────────────
    // The inverter converts DC from the battery to AC for the motor. It
    // generates significant heat under sustained high-load driving. BMS/VCU
    // will derate motor output if inverter temperature exceeds ~80–90 °C
    // on most platforms. Motor winding temperature is a separate signal.
    {
      id: 'inverter_motor_temp',
      instruction:
        'Read inverter temperature and motor winding temperature from live data. Normal operating range is typically 20–80 °C; derating begins around 85–90 °C on most EVs.',
      question: 'What do the inverter and motor temperature readings show?',
      options: [
        {
          label: 'Both within normal range (below 80 °C)',
          effect: { inverter_overheat_issue: REDUCE },
        },
        {
          label: 'Inverter temperature elevated (80–90 °C)',
          effect: { inverter_overheat_issue: MEDIUM },
        },
        {
          label: 'Inverter or motor temperature above 90 °C — thermal derating active',
          effect: { inverter_overheat_issue: HEAVY },
        },
        {
          label: 'Temperature data not available',
          effect: {},
        },
      ],
    },

    // ── STEP 6: Charge cable, port, and charger status ──────────────────────
    // Charging faults are often mechanical or communication-layer issues rather
    // than onboard charger failures. Inspect the cable, port, and EVSE status
    // light before condemning the OBC.
    {
      id: 'charge_connection',
      instruction:
        'Inspect the charge port for debris, bent pins, or burn marks. Test with a different known-good cable and a different EVSE (home charger / public station). Observe whether the charging session initiates within 30 seconds of plug-in.',
      question: 'What does the charge connection inspection show?',
      options: [
        {
          label: 'Charge session starts normally with the same cable and EVSE',
          effect: {
            charge_connection_issue: REDUCE,
            onboard_charger_issue: REDUCE,
          },
        },
        {
          label: 'Fault clears with a different cable or EVSE — cable or station issue',
          effect: { charge_connection_issue: HEAVY },
        },
        {
          label: 'Charge port damaged — bent pins, debris, or burn marks visible',
          effect: { charge_connection_issue: HEAVY },
        },
        {
          label: 'Fault persists across multiple cables and EVSE — OBC likely',
          // Cable and EVSE ruled out; fault is inside the vehicle's OBC.
          effect: { onboard_charger_issue: HEAVY, charge_connection_issue: REDUCE },
        },
        {
          label: 'Not tested — charging not the primary complaint',
          effect: {},
        },
      ],
    },

    // ── STEP 7: High-voltage isolation check ────────────────────────────────
    // ⚠ SAFETY: An isolation fault means the HV circuit may have a path to
    // vehicle ground. This is a serious safety hazard. Do not attempt any
    // HV component removal without confirming isolation resistance is above
    // the manufacturer's threshold (typically ≥ 500 Ω/V of system voltage,
    // i.e. ≥ 200 kΩ on a 400 V system).
    {
      id: 'hv_isolation',
      instruction:
        '⚠ HV SAFETY: Only perform this step if you are trained and equipped for HV work.\n\nUsing the BMS live data or a dedicated HV isolation tester, read the isolation resistance between the HV positive/negative rails and chassis ground. Manufacturer threshold is typically ≥ 500 kΩ.',
      question: 'What does the HV isolation measurement show?',
      options: [
        {
          label: 'Good — at or above spec (≥ 500 kΩ)',
          effect: { hv_isolation_issue: REDUCE },
        },
        {
          label: 'Degraded — below spec but not critically low (100–499 kΩ)',
          // Below the 500 kΩ threshold; insulation is compromised but has not
          // failed completely. Full insulation inspection advised before returning
          // the vehicle to service.
          effect: { hv_isolation_issue: MEDIUM },
        },
        {
          label: 'Critical — well below threshold (< 100 kΩ) or active fault confirmed',
          // Serious safety fault. Vehicle must not be driven until repaired.
          // Do not expose HV components without full PPE and isolation confirmation.
          effect: { hv_isolation_issue: HEAVY },
        },
        {
          label: 'Isolation test not performed — not the presenting complaint',
          effect: {},
        },
      ],
    },

    // ── STEP 8: Next action determination ───────────────────────────────────
    // Final step confirms the most likely corrective action based on the
    // accumulated evidence. This closes the diagnostic loop without dead ends.
    {
      id: 'next_action',
      instruction:
        'Based on all findings so far, select the most likely recommended next action for this vehicle.',
      question: 'Which action best matches all the evidence collected?',
      options: [
        {
          label: 'Cool-down period — let battery / inverter temperature normalise and retest',
          // Thermal event: if derating resolves after cool-down, the root cause
          // is thermal management (cooling system, driving profile) not component failure.
          effect: {
            battery_thermal_issue: MEDIUM,
            inverter_overheat_issue: MEDIUM,
          },
        },
        {
          label: 'Charge the vehicle — SOC too low to rule out capacity issue',
          effect: { low_soc_or_soh_issue: MEDIUM },
        },
        {
          label: 'Battery pack inspection / cell replacement — imbalance or SOH fault',
          effect: {
            cell_imbalance_issue: MEDIUM,
            low_soc_or_soh_issue: SLIGHT,
          },
        },
        {
          label: 'OBC or charge port repair — charging system fault confirmed',
          effect: {
            onboard_charger_issue: MEDIUM,
            charge_connection_issue: SLIGHT,
          },
        },
        {
          label: 'HV safety inspection — isolation fault requires immediate attention',
          effect: { hv_isolation_issue: STRONG },
        },
      ],
    },

  ],
};
