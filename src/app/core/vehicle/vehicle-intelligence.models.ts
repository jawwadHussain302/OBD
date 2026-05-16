export interface VehicleIntelligenceProfile {
  vin?: string;
  vinHash?: string;
  vinPattern?: string;
  make: string;
  model: string;
  year?: number;
  engine?: string;
  fuelType?: 'petrol' | 'diesel' | 'hybrid' | 'ev' | 'unknown';
  protocol?: string;
  supportedPids?: string[];
  source: 'local' | 'user_confirmed' | 'ai_generated';
  reviewStatus: 'verified' | 'pending_review';
  createdAt: string;
  updatedAt: string;
}
