export interface VehicleMake {
  name: string;
  models: string[];
}

export const VEHICLE_MAKES: VehicleMake[] = [
  { name: 'Audi', models: ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'TT', 'R8'] },
  { name: 'BMW', models: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'M3', 'M5'] },
  { name: 'Chevrolet', models: ['Camaro', 'Corvette', 'Cruze', 'Equinox', 'Impala', 'Malibu', 'Silverado 1500', 'Sonic', 'Spark', 'Tahoe', 'Traverse', 'Trax'] },
  { name: 'Ford', models: ['Bronco', 'EcoSport', 'Edge', 'Escape', 'Expedition', 'Explorer', 'F-150', 'F-250', 'Fusion', 'Maverick', 'Mustang', 'Ranger', 'Transit'] },
  { name: 'Honda', models: ['Accord', 'Civic', 'City', 'CR-V', 'CR-Z', 'Fit', 'HR-V', 'Insight', 'Jazz', 'Odyssey', 'Passport', 'Pilot', 'Ridgeline'] },
  { name: 'Hyundai', models: ['Accent', 'Creta', 'Elantra', 'i10', 'i20', 'i30', 'Ioniq', 'Kona', 'Palisade', 'Santa Fe', 'Sonata', 'Tucson', 'Venue'] },
  { name: 'Kia', models: ['Carnival', 'EV6', 'Forte', 'K5', 'Niro', 'Seltos', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Telluride'] },
  { name: 'Mazda', models: ['CX-3', 'CX-5', 'CX-9', 'CX-30', 'Mazda2', 'Mazda3', 'Mazda6', 'MX-5 Miata', 'MX-30'] },
  { name: 'Mercedes-Benz', models: ['A-Class', 'B-Class', 'C-Class', 'CLA', 'CLS', 'E-Class', 'G-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'S-Class', 'SLC', 'AMG GT'] },
  { name: 'Nissan', models: ['Altima', 'Armada', 'Frontier', 'GT-R', 'Juke', 'Kicks', 'Leaf', 'Maxima', 'Murano', 'Navara', 'Pathfinder', 'Qashqai', 'Rogue', 'Sentra', 'Titan', 'Versa', 'X-Trail'] },
  { name: 'Subaru', models: ['Ascent', 'BRZ', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Outback', 'Solterra', 'WRX'] },
  { name: 'Suzuki', models: ['Alto', 'Baleno', 'Celerio', 'Ciaz', 'Dzire', 'Ertiga', 'Grand Vitara', 'Ignis', 'Jimny', 'S-Presso', 'Swift', 'Vitara', 'Wagon R', 'XL7'] },
  { name: 'Toyota', models: ['86', 'Avalon', 'Camry', 'Corolla', 'C-HR', 'Fortuner', 'GR Supra', 'Hiace', 'Highlander', 'Hilux', 'Land Cruiser', 'Prado', 'Prius', 'RAV4', 'Rush', 'Sequoia', 'Sienna', 'Tacoma', 'Tundra', 'Venza', 'Yaris'] },
  { name: 'Volkswagen', models: ['Arteon', 'Atlas', 'Golf', 'GTI', 'ID.4', 'Jetta', 'Passat', 'Polo', 'Taos', 'Tiguan', 'Touareg', 'T-Roc', 'Up!'] },
  { name: 'Other', models: ['Other'] },
];

export const MAKE_NAMES = VEHICLE_MAKES.map(m => m.name);

export function getModelsForMake(make: string): string[] {
  return VEHICLE_MAKES.find(m => m.name === make)?.models ?? [];
}

export function getYearRange(): number[] {
  const currentYear = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = currentYear; y >= 1990; y--) {
    years.push(y);
  }
  return years;
}
