import { Injectable } from '@angular/core';
import { VEHICLE_PROFILE_FUNCTION_URL } from '../ai/ai-endpoint.config';
import { VehicleIntelligenceProfile } from './vehicle-intelligence.models';

type ProfileAction = 'getByVin' | 'getByVinPattern' | 'save';

interface LookupResponse {
  profile: VehicleIntelligenceProfile | null;
}

@Injectable({ providedIn: 'root' })
export class VehicleIntelligenceService {

  async getProfileByVin(vin: string): Promise<VehicleIntelligenceProfile | null> {
    return this.request('getByVin', { vin });
  }

  async getProfileByVinPattern(vinPattern: string): Promise<VehicleIntelligenceProfile | null> {
    return this.request('getByVinPattern', { vinPattern });
  }

  /**
   * Save a confirmed vehicle profile to Firestore.
   * idToken is optional — when absent the server returns 401 and the write is
   * rejected server-side. Errors are caught internally and never propagate to
   * the caller, so this is safe to call fire-and-forget.
   */
  async saveConfirmedProfile(
    profile: Omit<VehicleIntelligenceProfile, 'source' | 'reviewStatus' | 'createdAt' | 'updatedAt'>,
    idToken?: string,
  ): Promise<void> {
    await this.request('save', { profile }, idToken);
  }

  private async request(
    action: ProfileAction,
    payload: Record<string, unknown>,
    idToken?: string,
  ): Promise<VehicleIntelligenceProfile | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const res = await fetch(VEHICLE_PROFILE_FUNCTION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...payload }),
      });

      if (!res.ok) {
        console.warn(`VehicleIntelligenceService: HTTP ${res.status} for action "${action}"`);
        return null;
      }

      const data = await res.json() as LookupResponse;
      return data.profile ?? null;
    } catch (err) {
      console.error('VehicleIntelligenceService: request failed', err);
      return null;
    }
  }
}
