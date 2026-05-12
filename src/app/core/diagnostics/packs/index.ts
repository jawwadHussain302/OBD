import type { KnowledgePack } from '../diagnostic-types';
import { batteryChargingPack } from './battery-charging.pack';
import { dpfEgrPack } from './dpf-egr.pack';
import { evReducedPowerPack } from './ev-reduced-power.pack';
import { highFuelConsumptionPack } from './high-fuel-consumption.pack';
import { lackOfPowerPack } from './lack-of-power.pack';
import { misfirePack } from './misfire.pack';
import { noStartPack } from './no-start.pack';
import { overheatingPack } from './overheating.pack';
import { roughIdlePack } from './rough-idle.pack';

export { noStartPack } from './no-start.pack';
export { misfirePack } from './misfire.pack';
export { roughIdlePack } from './rough-idle.pack';
export { lackOfPowerPack } from './lack-of-power.pack';
export { highFuelConsumptionPack } from './high-fuel-consumption.pack';
export { overheatingPack } from './overheating.pack';
export { batteryChargingPack } from './battery-charging.pack';
export { dpfEgrPack } from './dpf-egr.pack';
export { evReducedPowerPack } from './ev-reduced-power.pack';

export const allDiagnosticPacks: readonly KnowledgePack[] = [
  noStartPack,
  misfirePack,
  roughIdlePack,
  lackOfPowerPack,
  highFuelConsumptionPack,
  overheatingPack,
  batteryChargingPack,
  dpfEgrPack,
  evReducedPowerPack,
];
