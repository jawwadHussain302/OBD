export interface VehicleProfile {
  id: string;
  make: string;
  model: string;
  year: number;
  trimVariant: string;
  engineSize: string;
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'electric' | 'unknown';
  transmission: 'manual' | 'automatic' | 'cvt' | 'unknown';
  vin?: string;
  detectedProtocol?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
