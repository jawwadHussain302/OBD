import { Injectable } from '@angular/core';
import { VEHICLE_PROFILE_FUNCTION_URL } from '../ai/ai-endpoint.config';
import { VehicleIntelligenceProfile } from './vehicle-intelligence.models';

type ProfileAction = 'getByVin' | 'getByVinPattern' | 'save';

interface LookupResponse {
  profile: VehicleIntelligenceProfile | null;
}

export interface VehicleProfileSaveResult {
  saved: boolean;
  profile: VehicleIntelligenceProfile | null;
  message: string;
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
  ): Promise<VehicleProfileSaveResult> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const res = await fetch(VEHICLE_PROFILE_FUNCTION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'save', profile }),
      });

      if (res.status === 401) {
        return {
          saved: false,
          profile: null,
          message: 'Saved locally. Cloud learning is waiting for Firebase anonymous auth.',
        };
      }

      if (!res.ok) {
        return {
          saved: false,
          profile: null,
          message: `Saved locally. Cloud profile save failed with HTTP ${res.status}.`,
        };
      }

      const data = await res.json() as LookupResponse;
      return {
        saved: true,
        profile: data.profile ?? null,
        message: 'Saved locally and synced to the vehicle learning database.',
      };
    } catch (err) {
      console.error('VehicleIntelligenceService: save failed', err);
      return {
        saved: false,
        profile: null,
        message: 'Saved locally. Cloud profile save is unavailable right now.',
      };
    }
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
