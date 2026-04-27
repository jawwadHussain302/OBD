import { DtcCode } from './dtc-code.model';

export const GENERIC_DTC_MAP: Record<string, Omit<DtcCode, 'code' | 'source'>> = {
  P0100: { description: 'Mass Air Flow circuit malfunction',              category: 'Fuel & Air Metering' },
  P0101: { description: 'Mass Air Flow circuit range/performance',        category: 'Fuel & Air Metering' },
  P0102: { description: 'Mass Air Flow circuit low input',               category: 'Fuel & Air Metering' },
  P0103: { description: 'Mass Air Flow circuit high input',              category: 'Fuel & Air Metering' },
  P0104: { description: 'Mass Air Flow circuit intermittent',            category: 'Fuel & Air Metering' },
  P0110: { description: 'Intake Air Temperature circuit malfunction',    category: 'Fuel & Air Metering' },
  P0115: { description: 'Engine Coolant Temperature circuit malfunction',category: 'Engine Cooling' },
  P0120: { description: 'Throttle Position Sensor A circuit malfunction',category: 'Throttle' },
  P0130: { description: 'O2 Sensor circuit malfunction (Bank 1 Sensor 1)',category: 'Oxygen Sensor' },
  P0133: { description: 'O2 Sensor circuit slow response (Bank 1 Sensor 1)',category: 'Oxygen Sensor' },
  P0171: { description: 'System too lean (Bank 1)',                       category: 'Fuel Trim' },
  P0172: { description: 'System too rich (Bank 1)',                       category: 'Fuel Trim' },
  P0300: { description: 'Random/multiple cylinder misfire detected',      category: 'Misfire' },
  P0301: { description: 'Cylinder 1 misfire detected',                    category: 'Misfire' },
  P0302: { description: 'Cylinder 2 misfire detected',                    category: 'Misfire' },
  P0303: { description: 'Cylinder 3 misfire detected',                    category: 'Misfire' },
  P0304: { description: 'Cylinder 4 misfire detected',                    category: 'Misfire' },
};
