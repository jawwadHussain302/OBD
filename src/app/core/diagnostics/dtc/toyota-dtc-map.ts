import { DtcCode } from './dtc-code.model';

export const TOYOTA_DTC_MAP: Record<string, Omit<DtcCode, 'code' | 'source'>> = {
  P1135: { description: 'Air/Fuel Sensor Heater Circuit Response (Bank 1 Sensor 1)', category: 'Oxygen Sensor', manufacturerSpecific: true },
  P1155: { description: 'Air/Fuel Sensor Heater Circuit Response (Bank 2 Sensor 1)', category: 'Oxygen Sensor', manufacturerSpecific: true },
  P1251: { description: 'Negative Pressure Vacuum Sensor Malfunction',               category: 'Intake System',  manufacturerSpecific: true },
};
