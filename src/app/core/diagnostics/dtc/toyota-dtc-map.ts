import { DtcCode } from './dtc-code.model';

export const TOYOTA_DTC_MAP: Record<string, Omit<DtcCode, 'code' | 'source'>> = {
  P1135: {
    title: 'Air/Fuel Sensor Heater Circuit Response (Bank 1 Sensor 1)',
    description: 'The A/F sensor heater on Bank 1 Sensor 1 is not reaching operating temperature within expected time.',
    category: 'Powertrain', subsystem: 'Oxygen Sensor', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty A/F sensor heater element', 'Blown fuse for sensor heater', 'Wiring fault'],
    recommendedChecks: ['Check fuse for A/F sensor heater', 'Measure heater resistance (spec ~2–4 Ω)', 'Inspect wiring'],
  },
  P1155: {
    title: 'Air/Fuel Sensor Heater Circuit Response (Bank 2 Sensor 1)',
    description: 'The A/F sensor heater on Bank 2 Sensor 1 is not reaching operating temperature within expected time.',
    category: 'Powertrain', subsystem: 'Oxygen Sensor', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty A/F sensor heater element', 'Blown fuse for sensor heater', 'Wiring fault'],
    recommendedChecks: ['Check fuse for A/F sensor heater', 'Measure heater resistance (spec ~2–4 Ω)', 'Inspect wiring'],
  },
  P1251: {
    title: 'Negative Pressure Vacuum Sensor Malfunction',
    description: 'The negative pressure vacuum sensor signal is out of expected range.',
    category: 'Powertrain', subsystem: 'Intake System', severity: 'Medium',
    manufacturer: 'Toyota',
    possibleCauses: ['Faulty vacuum sensor', 'Vacuum hose disconnected or cracked', 'Wiring fault'],
    recommendedChecks: ['Check vacuum hoses for leaks', 'Inspect sensor connector', 'Measure sensor voltage vs vacuum'],
  },
};
