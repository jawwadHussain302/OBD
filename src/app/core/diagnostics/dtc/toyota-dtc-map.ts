import { DtcCode } from './dtc-code.model';

export const TOYOTA_DTC_MAP: Record<string, Omit<DtcCode, 'code' | 'source'>> = {
  // ── A/F Sensor Heater ─────────────────────────────────────────────────────
  P1130: {
    title: 'Air/Fuel Sensor Circuit Range/Performance (Bank 1 Sensor 1)',
    description: 'The A/F sensor on Bank 1 Sensor 1 output is out of range or not responding correctly.',
    category: 'Powertrain', subsystem: 'Oxygen Sensor', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Aged or contaminated A/F sensor', 'Exhaust leak near sensor', 'Wiring fault'],
    recommendedChecks: ['Inspect exhaust system for leaks upstream of sensor', 'Check sensor signal wiring', 'Replace sensor if resistance out of spec'],
  },
  P1133: {
    title: 'Air/Fuel Sensor Circuit Response (Bank 1 Sensor 1)',
    description: 'The A/F sensor on Bank 1 Sensor 1 is slow to respond to commanded fuel changes.',
    category: 'Powertrain', subsystem: 'Oxygen Sensor', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Ageing or contaminated A/F sensor', 'Exhaust restriction', 'Wiring resistance fault'],
    recommendedChecks: ['Verify sensor heating time with live data', 'Check for exhaust backpressure', 'Replace sensor if response time is excessive'],
  },
  P1135: {
    title: 'Air/Fuel Sensor Heater Circuit Response (Bank 1 Sensor 1)',
    description: 'The A/F sensor heater on Bank 1 Sensor 1 is not reaching operating temperature within expected time.',
    category: 'Powertrain', subsystem: 'Oxygen Sensor', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty A/F sensor heater element', 'Blown fuse for sensor heater', 'Wiring fault'],
    recommendedChecks: ['Check fuse for A/F sensor heater', 'Measure heater resistance (spec ~2–4 Ω)', 'Inspect wiring'],
  },
  P1150: {
    title: 'Air/Fuel Sensor Circuit Range/Performance (Bank 2 Sensor 1)',
    description: 'The A/F sensor on Bank 2 Sensor 1 output is out of range or not responding correctly.',
    category: 'Powertrain', subsystem: 'Oxygen Sensor', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Aged or contaminated A/F sensor', 'Exhaust leak near sensor', 'Wiring fault'],
    recommendedChecks: ['Inspect exhaust system for leaks upstream of Bank 2 sensor', 'Check sensor signal wiring', 'Replace sensor if resistance out of spec'],
  },
  P1153: {
    title: 'Air/Fuel Sensor Circuit Response (Bank 2 Sensor 1)',
    description: 'The A/F sensor on Bank 2 Sensor 1 is slow to respond to commanded fuel changes.',
    category: 'Powertrain', subsystem: 'Oxygen Sensor', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Ageing or contaminated A/F sensor', 'Exhaust restriction on Bank 2', 'Wiring resistance fault'],
    recommendedChecks: ['Verify sensor heating time with live data', 'Check for exhaust backpressure on Bank 2', 'Replace sensor if response time is excessive'],
  },
  P1155: {
    title: 'Air/Fuel Sensor Heater Circuit Response (Bank 2 Sensor 1)',
    description: 'The A/F sensor heater on Bank 2 Sensor 1 is not reaching operating temperature within expected time.',
    category: 'Powertrain', subsystem: 'Oxygen Sensor', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty A/F sensor heater element', 'Blown fuse for sensor heater', 'Wiring fault'],
    recommendedChecks: ['Check fuse for A/F sensor heater', 'Measure heater resistance (spec ~2–4 Ω)', 'Inspect wiring'],
  },

  // ── Vacuum / Intake ───────────────────────────────────────────────────────
  P1251: {
    title: 'Negative Pressure Vacuum Sensor Malfunction',
    description: 'The negative pressure vacuum sensor signal is out of expected range.',
    category: 'Powertrain', subsystem: 'Intake System', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty vacuum sensor', 'Vacuum hose disconnected or cracked', 'Wiring fault'],
    recommendedChecks: ['Check vacuum hoses for leaks', 'Inspect sensor connector', 'Measure sensor voltage vs vacuum'],
  },

  // ── Variable Valve Timing (VVT-i) ─────────────────────────────────────────
  P1346: {
    title: 'Variable Valve Timing Sensor Range/Performance (Bank 1)',
    description: 'The VVT sensor on Bank 1 is reporting a signal outside expected range for current cam position.',
    category: 'Powertrain', subsystem: 'Valve Train', severity: 'High',
    manufacturer: 'Toyota',
    possibleCauses: ['Low engine oil level or pressure', 'Clogged VVT oil control valve filter screen', 'Faulty cam position sensor', 'Timing chain stretch'],
    recommendedChecks: ['Check oil level and condition', 'Inspect VVT oil control valve (OCV) and filter', 'Verify cam sensor signal with oscilloscope', 'Check timing chain stretch'],
  },
  P1349: {
    title: 'Variable Valve Timing System Malfunction (Bank 1)',
    description: 'The VVT-i system on Bank 1 is not achieving the commanded cam angle.',
    category: 'Powertrain', subsystem: 'Valve Train', severity: 'High',
    manufacturer: 'Toyota',
    possibleCauses: ['Low oil pressure', 'Stuck or dirty VVT oil control valve', 'Faulty VVT actuator', 'Timing chain wear'],
    recommendedChecks: ['Check engine oil pressure', 'Clean or replace VVT oil control valve', 'Inspect VVT actuator function', 'Check for timing chain noise on cold start'],
  },

  // ── Ignition ──────────────────────────────────────────────────────────────
  P1300: {
    title: 'Igniter Circuit Malfunction (Bank 1)',
    description: 'The primary ignition circuit for Bank 1 is not generating the expected signal.',
    category: 'Powertrain', subsystem: 'Ignition', severity: 'High',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty igniter module', 'Open or shorted ignition coil wiring', 'Failed ignition coil'],
    recommendedChecks: ['Check ignition coil primary resistance', 'Inspect igniter wiring harness for damage', 'Test igniter signal with oscilloscope'],
  },
  P1305: {
    title: 'Igniter Circuit Malfunction (Bank 2)',
    description: 'The primary ignition circuit for Bank 2 is not generating the expected signal.',
    category: 'Powertrain', subsystem: 'Ignition', severity: 'High',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty igniter module', 'Open or shorted ignition coil wiring on Bank 2', 'Failed ignition coil'],
    recommendedChecks: ['Check ignition coil primary resistance on Bank 2', 'Inspect igniter wiring harness for damage', 'Test igniter signal with oscilloscope'],
  },

  // ── EGR ───────────────────────────────────────────────────────────────────
  P1401: {
    title: 'EGR Temperature Sensor Circuit Range/Performance',
    description: 'The EGR temperature sensor is not detecting temperature rise during EGR operation, indicating EGR flow may be absent.',
    category: 'Powertrain', subsystem: 'EGR', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Clogged EGR passages or valve', 'Faulty EGR temperature sensor', 'Faulty EGR valve not opening', 'Wiring fault'],
    recommendedChecks: ['Inspect EGR valve for carbon build-up', 'Test EGR temperature sensor resistance', 'Verify EGR valve operation with vacuum pump', 'Inspect vacuum lines to EGR valve'],
  },

  // ── Fuel System ───────────────────────────────────────────────────────────
  P1200: {
    title: 'Fuel Injector Circuit Malfunction',
    description: 'The fuel injector circuit is detecting an open or short that prevents normal injector operation.',
    category: 'Powertrain', subsystem: 'Fuel Delivery', severity: 'High',
    manufacturer: 'Toyota',
    possibleCauses: ['Open or shorted injector wiring', 'Faulty injector', 'ECU driver fault'],
    recommendedChecks: ['Measure injector resistance (spec ~13–16 Ω)', 'Check injector wiring for shorts or opens', 'Verify injector pulse width with oscilloscope'],
  },

  // ── ECU / Power Supply ────────────────────────────────────────────────────
  P1600: {
    title: 'TCM Battery Power Supply Circuit Malfunction',
    description: 'The Transmission Control Module is not receiving battery voltage from its dedicated supply circuit.',
    category: 'Powertrain', subsystem: 'Transmission', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Blown fuse for TCM power supply', 'Loose or corroded TCM battery connector', 'Wiring open circuit'],
    recommendedChecks: ['Check TCM dedicated fuse in engine bay fuse box', 'Inspect TCM wiring harness connectors', 'Measure voltage at TCM B+ terminal'],
  },
  P1633: {
    title: 'Ignition SW Power Source Circuit Malfunction',
    description: 'The ECM/PCM is not detecting the expected voltage on the ignition switch power input circuit.',
    category: 'Powertrain', subsystem: 'ECU/PCM', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty ignition switch', 'Open circuit in ignition feed to ECM', 'Blown ignition fuse'],
    recommendedChecks: ['Check ignition fuse', 'Measure voltage at ECM IG terminal during cranking', 'Inspect ignition switch contacts'],
  },

  // ── Throttle Body ─────────────────────────────────────────────────────────
  P1125: {
    title: 'Throttle Control Motor Circuit Malfunction',
    description: 'The Electronic Throttle Control System (ETCS) motor circuit has an open or short detected by the ECM.',
    category: 'Powertrain', subsystem: 'Throttle Control', severity: 'Critical',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty electronic throttle body motor', 'Open or short in throttle motor wiring', 'ECM throttle driver fault'],
    recommendedChecks: ['Measure throttle motor resistance (spec ~1–3 Ω)', 'Check throttle body wiring harness', 'Inspect throttle body for binding or carbon build-up'],
  },
  P1127: {
    title: 'ETCS Actuator Power Source Circuit Malfunction',
    description: 'The power supply to the Electronic Throttle Control System actuator is outside expected range.',
    category: 'Powertrain', subsystem: 'Throttle Control', severity: 'Critical',
    manufacturer: 'Toyota',
    possibleCauses: ['Low battery voltage', 'Faulty ETCS relay', 'Open circuit in ETCS power feed'],
    recommendedChecks: ['Check battery condition and charging system', 'Inspect ETCS relay and fuse', 'Verify ETCS power supply voltage with scan tool'],
  },
};
