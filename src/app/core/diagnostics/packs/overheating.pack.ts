import { KnowledgePack } from '../diagnostic-types';

// ── Score delta constants ─────────────────────────────────────────────────────
// Identical magnitude scale to all previous packs for consistency.

const HEAVY  =  0.40;   // Definitive or measurement-confirmed finding
const STRONG =  0.35;   // Direct observation strongly implicating this cause
const MEDIUM =  0.20;   // Supporting evidence consistent with this cause
const SLIGHT =  0.15;   // Weak corroborating signal
const REDUCE = -0.20;   // Evidence against this cause

// ── Pack definition ───────────────────────────────────────────────────────────

export const overheatingPack: KnowledgePack = {
  id: 'overheating',
  title: 'Engine Overheating Diagnostic',

  // Seven root causes covering the full overheating failure space.
  // 7 × 0.14 ≈ 0.98 — balanced starting point, no prior assumption.
  hypotheses: [
    { id: 'coolant_loss_issue',         initialConfidence: 0.14 },
    { id: 'thermostat_issue',           initialConfidence: 0.14 },
    { id: 'radiator_restriction_issue', initialConfidence: 0.14 },
    { id: 'cooling_fan_issue',          initialConfidence: 0.14 },
    { id: 'water_pump_issue',           initialConfidence: 0.14 },
    { id: 'head_gasket_issue',          initialConfidence: 0.14 },
    { id: 'trapped_air_issue',          initialConfidence: 0.14 },
  ],

  steps: [

    // ── STEP 1: Symptom Confirmation ────────────────────────────────────────
    // The presenting symptoms distinguish a sudden, rapid overheat (often
    // coolant loss or fan failure at idle) from a gradual temperature rise
    // under sustained load (radiator restriction, water pump weakness).
    // Heater blowing cold while the gauge reads hot is a classic trapped-air
    // or water pump symptom — coolant is not circulating through the heater core.
    {
      id: 'symptom_confirmation',
      instruction:
        'Ask the driver when overheating was first noticed and what conditions triggered it. ' +
        'Note whether the temperature gauge rises quickly or climbs slowly over a long drive, ' +
        'whether the heater is blowing hot or cold while the engine is hot, and whether steam ' +
        'or coolant odour has been noticed.',
      question: 'Which best describes the overheating symptom?',
      options: [
        {
          label: 'Temperature rises quickly at idle or in slow traffic — fine at speed',
          // Rapid overheat at idle with recovery at speed is the classic cooling fan failure
          // pattern: at speed, ram air cools the radiator without the fan; at idle, it cannot.
          effect: { cooling_fan_issue: STRONG, coolant_loss_issue: SLIGHT },
        },
        {
          label: 'Temperature climbs gradually on long drives or uphill — fine around town',
          // Sustained high-load overheat points to reduced flow capacity: restricted radiator,
          // weak water pump, or a thermostat that opens too late.
          effect: { radiator_restriction_issue: MEDIUM, water_pump_issue: MEDIUM, thermostat_issue: SLIGHT },
        },
        {
          label: 'Heater blows cold while engine temperature is high',
          // Air lock in the cooling system prevents coolant reaching the heater core.
          // Also consistent with a water pump impeller that has slipped its shaft.
          effect: { trapped_air_issue: STRONG, water_pump_issue: MEDIUM },
        },
        {
          label: 'Sudden overheat with visible steam or coolant loss',
          // Rapid boil-over: blown hose, failed pressure cap, severe coolant loss,
          // or head gasket breach forcing combustion gases into the coolant circuit.
          effect: { coolant_loss_issue: STRONG, head_gasket_issue: MEDIUM },
        },
        {
          label: 'Intermittent — overheats then recovers without intervention',
          // Intermittent overheat: thermostat opening slowly or a partially blocked
          // radiator that clears momentarily when coolant pressure forces flow through.
          effect: { thermostat_issue: MEDIUM, radiator_restriction_issue: SLIGHT },
        },
        {
          label: 'Not sure',
          effect: {},
        },
      ],
    },

    // ── STEP 2: Coolant Level and Leak Inspection ───────────────────────────
    // A low coolant level is the most common cause of overheating and is
    // checked first because it is free to inspect and immediately actionable.
    // Coolant loss can be external (visible leak) or internal (head gasket
    // consuming coolant into the combustion chamber without leaving a puddle).
    {
      id: 'coolant_level_and_leaks',
      instruction:
        'Allow the engine to cool completely before removing the coolant reservoir cap. ' +
        'Check the coolant level against the MIN/MAX marks on the reservoir. ' +
        'Inspect the ground under the car for coolant puddles (typically pink, green, or orange). ' +
        'Inspect all visible hoses, the radiator, heater core connections, and the water pump ' +
        'housing for signs of dried coolant or active weeping.',
      question: 'What does the coolant level and leak check reveal?',
      options: [
        {
          label: 'Coolant level low and a visible external leak found (hose, radiator, pump)',
          // External leak directly accounts for coolant loss — source is confirmed.
          effect: { coolant_loss_issue: HEAVY },
        },
        {
          label: 'Coolant level low but no external leak visible',
          // Internal consumption: coolant is being lost through the head gasket into the
          // combustion chamber (white exhaust smoke) or oil (milky dipstick).
          effect: { coolant_loss_issue: MEDIUM, head_gasket_issue: STRONG },
        },
        {
          label: 'Coolant level correct — no leaks found',
          // Not a simple coolant loss scenario — look toward flow or fan issues.
          effect: { coolant_loss_issue: REDUCE },
        },
        {
          label: 'Not checked — engine too hot to inspect safely',
          effect: {},
        },
      ],
    },

    // ── STEP 3: Cooling Fan Operation ───────────────────────────────────────
    // Electric cooling fans must activate once coolant temperature exceeds the
    // fan switch threshold (typically 95–100°C). A failed fan motor, blown fuse,
    // or faulty fan relay/switch will prevent operation. On belt-driven viscous
    // fans, a seized or slipping fan clutch is the equivalent failure.
    {
      id: 'cooling_fan_check',
      instruction:
        'With the engine at operating temperature and idling, observe the radiator fan(s). ' +
        'Electric fans should be running. If not, check the fan fuse and relay in the fusebox. ' +
        'On belt-driven fans: with the engine off and cool, try to spin the fan by hand — ' +
        'excessive free-spin with little resistance indicates a slipping viscous fan clutch. ' +
        'A scan tool can also command the fan on directly if the vehicle supports it.',
      question: 'What does the cooling fan check reveal?',
      options: [
        {
          label: 'Fan not running at hot idle — confirmed not spinning',
          // Fan motor failure, blown fuse, or faulty relay. Definitive finding.
          effect: { cooling_fan_issue: HEAVY },
        },
        {
          label: 'Fan runs intermittently or at low speed only — not reaching full speed',
          // Weak fan motor or failing relay — insufficient airflow at idle.
          effect: { cooling_fan_issue: STRONG },
        },
        {
          label: 'Viscous fan clutch spins too freely with engine off (slipping)',
          // A slipping clutch delivers minimal airflow — acts like no fan at slow speeds.
          effect: { cooling_fan_issue: STRONG },
        },
        {
          label: 'Fan confirmed running correctly at full speed',
          effect: { cooling_fan_issue: REDUCE },
        },
        {
          label: 'Not checked',
          effect: {},
        },
      ],
    },

    // ── STEP 4: Radiator Hose Temperature Profile ───────────────────────────
    // The temperature difference between the upper and lower radiator hoses
    // reveals whether the radiator is transferring heat effectively. Under
    // normal operation, the upper hose (hot coolant from engine) should be
    // significantly hotter than the lower hose (cooled coolant returning to
    // engine). A small delta means the radiator is not cooling the coolant —
    // either because flow is blocked or because airflow across the core is absent.
    {
      id: 'hose_temperature_check',
      instruction:
        'Using an infrared temperature gun, measure the upper radiator hose (outlet from engine) ' +
        'and the lower radiator hose (return to engine) with the engine at operating temperature. ' +
        'Normal: upper hose 85–100°C, lower hose 15–30°C cooler than upper. ' +
        'A small temperature difference (less than 10°C) between upper and lower indicates ' +
        'poor heat exchange — blocked radiator core or insufficient airflow.',
      question: 'What do the upper and lower hose temperatures show?',
      options: [
        {
          label: 'Upper hose very hot, lower hose nearly as hot — minimal temperature drop',
          // The radiator is not cooling the coolant: blocked core or no airflow.
          effect: { radiator_restriction_issue: STRONG, cooling_fan_issue: SLIGHT },
        },
        {
          label: 'Upper hose hot but lower hose much cooler — normal temperature drop',
          // Radiator is exchanging heat normally; restriction is unlikely.
          effect: { radiator_restriction_issue: REDUCE },
        },
        {
          label: 'Upper hose stays cool even when engine is overheating',
          // Coolant is not flowing into the radiator — thermostat stuck closed is the
          // primary suspect: the thermostat valve is preventing coolant entering the radiator.
          effect: { thermostat_issue: HEAVY, water_pump_issue: SLIGHT },
        },
        {
          label: 'Not checked — no temperature gun available',
          effect: {},
        },
      ],
    },

    // ── STEP 5: Thermostat Assessment ──────────────────────────────────────
    // A thermostat stuck closed is one of the most decisive overheating causes:
    // it prevents coolant from entering the radiator at all, causing rapid
    // temperature rise regardless of fan or pump condition. The upper radiator
    // hose remaining cold while the engine overheats is the definitive field test.
    // Removing and boiling the thermostat in water confirms opening temperature.
    {
      id: 'thermostat_assessment',
      instruction:
        'With the engine cold, feel both the upper radiator hose and the lower radiator hose. ' +
        'Start the engine and monitor: the upper hose should become hot only after the engine ' +
        'has warmed up (when the thermostat opens). If the upper hose stays cold while the ' +
        'temperature gauge climbs into the red, the thermostat is stuck closed. ' +
        'Alternatively, remove the thermostat and suspend it in boiling water — it should ' +
        'open fully at its rated temperature (typically 88–92°C).',
      question: 'What does thermostat testing show?',
      options: [
        {
          label: 'Upper hose stays cold — engine overheats without radiator flow',
          // Thermostat stuck closed: no coolant reaching the radiator. Definitive.
          effect: { thermostat_issue: HEAVY },
        },
        {
          label: 'Thermostat removed and tested — does not open in boiling water',
          // Confirmed failure: thermostat is seized closed.
          effect: { thermostat_issue: HEAVY },
        },
        {
          label: 'Upper hose gets hot at normal temperature — thermostat opening correctly',
          effect: { thermostat_issue: REDUCE },
        },
        {
          label: 'Not tested',
          effect: {},
        },
      ],
    },

    // ── STEP 6: Water Pump and Coolant Circulation ──────────────────────────
    // A water pump with a slipped or corroded impeller can spin without
    // actually moving coolant. This produces the paradox of a hot engine with
    // a cool radiator despite the thermostat appearing to open. Flow can be
    // checked by squeezing the upper hose at idle — a pump moving coolant
    // will produce a noticeable pressure pulse. A scan tool's coolant temp PID
    // dropping after thermostat opening is also evidence of active circulation.
    {
      id: 'water_pump_check',
      instruction:
        'With the engine warm and thermostat confirmed open (upper hose hot), squeeze the ' +
        'upper radiator hose firmly at idle — you should feel a pressure pulse from the pump. ' +
        'No pulse indicates poor flow. On visible belt-driven pumps, check the drive belt for ' +
        'slippage and the pulley for wobble (bearing failure). ' +
        'If accessible, look into the coolant reservoir with the engine warm and cap removed — ' +
        'active circulation produces turbulence in the reservoir.',
      question: 'What does water pump / circulation assessment show?',
      options: [
        {
          label: 'No pressure pulse in upper hose at idle with thermostat open',
          // Little to no coolant movement despite pump running — impeller slippage.
          effect: { water_pump_issue: HEAVY },
        },
        {
          label: 'Pump pulley wobbles or belt slipping visibly',
          // Mechanical failure of the water pump bearing or belt drive.
          effect: { water_pump_issue: STRONG },
        },
        {
          label: 'Good pressure pulse felt — coolant circulating normally',
          effect: { water_pump_issue: REDUCE },
        },
        {
          label: 'Not checked',
          effect: {},
        },
      ],
    },

    // ── STEP 7: Head Gasket Indicators ──────────────────────────────────────
    // A failing head gasket allows combustion gases to enter the cooling system,
    // or coolant to enter the combustion chamber. Combustion gas contamination
    // is detected by a combustion leak test (chemical block tester) or by
    // observing the exhaust. Coolant entering combustion produces distinctive
    // white exhaust smoke and oil contamination.
    {
      id: 'head_gasket_check',
      instruction:
        'Check the engine oil dipstick and oil filler cap for a white mayonnaise-like emulsion ' +
        '(coolant mixing with oil). Observe the exhaust during a cold start — white steam that ' +
        'persists after warm-up indicates coolant burning in the cylinders. ' +
        'Use a combustion block tester (chemical test strip) at the coolant reservoir — ' +
        'the indicator changes colour if combustion gases are present in the coolant. ' +
        'Check for bubbles in the coolant reservoir with the engine running.',
      question: 'What do head gasket indicator checks show?',
      options: [
        {
          label: 'Oil is milky / emulsified — coolant mixing with oil confirmed',
          // Coolant entering the sump through the head gasket breach.
          effect: { head_gasket_issue: HEAVY },
        },
        {
          label: 'White exhaust smoke persisting when warm and combustion tester positive',
          // Combustion gases in the coolant and coolant burning in cylinders.
          effect: { head_gasket_issue: HEAVY },
        },
        {
          label: 'Bubbles visible in coolant reservoir with engine running',
          // Combustion gases entering the coolant circuit under pressure.
          effect: { head_gasket_issue: STRONG },
        },
        {
          label: 'White exhaust smoke on start only — clears when warm',
          // Condensation burning off — normal cold-start behaviour, not a head gasket sign.
          effect: { head_gasket_issue: REDUCE },
        },
        {
          label: 'No indicators — oil clean, exhaust clear, tester negative',
          effect: { head_gasket_issue: REDUCE },
        },
        {
          label: 'Not checked',
          effect: {},
        },
      ],
    },

    // ── STEP 8: Trapped Air Assessment ──────────────────────────────────────
    // Air pockets in the cooling system prevent coolant from reaching certain
    // passages — most often the heater core and the top of the engine block.
    // This leads to hot spots and a heater that blows cold despite a hot engine.
    // Trapped air is common after coolant work (flushing, hose replacement,
    // head gasket repair) if the system was not bled correctly.
    {
      id: 'trapped_air_check',
      instruction:
        'Ask whether the cooling system was recently opened (coolant change, hose work, ' +
        'thermostat replacement). With the engine warm and heater set to full heat, ' +
        'squeeze the heater hoses — if one is hot and one is cool, the heater core is air-locked. ' +
        'Open the bleed screw (if fitted) at the highest point of the cooling system and run the ' +
        'engine with the reservoir cap off — air escaping indicates a trapped pocket. ' +
        'Burp the system by running the engine with the cap off and repeatedly squeezing the ' +
        'upper radiator hose until no more air bubbles emerge.',
      question: 'What does the trapped air check reveal?',
      options: [
        {
          label: 'System recently serviced and heater blows cold — trapped air likely',
          // Classic post-service air lock: system not bled correctly after coolant work.
          effect: { trapped_air_issue: HEAVY },
        },
        {
          label: 'Air escaping from bleed screw or bubbles at reservoir with cap off',
          // Confirmed air pocket — actively venting from the system.
          effect: { trapped_air_issue: STRONG },
        },
        {
          label: 'Heater hoses both hot and heater blows warm — no air lock',
          // Coolant is circulating through the heater core — no trapped air.
          effect: { trapped_air_issue: REDUCE },
        },
        {
          label: 'System not recently serviced and no cold heater symptom',
          // Trapped air unlikely without a recent coolant system disturbance.
          effect: { trapped_air_issue: REDUCE },
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
