/**
 * Represents a vehicle's configuration and metadata.
 */
export interface VehicleProfile {
  id: string;
  make: string;
  model: string;
  year: number;
  trimVariant: string;
  engineSize: string;
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'electric' | 'ev' | 'unknown';
  transmission: 'manual' | 'automatic' | 'cvt' | 'unknown';
  vin?: string;
  vinPattern?: string;
  detectedProtocol?: string;
  notes?: string;
  source?: 'user_confirmed' | 'vin_lookup' | 'vin_pattern';
  reviewStatus?: 'verified' | 'pending' | 'unreviewed';
  createdAt: number;
  updatedAt: number;
}
