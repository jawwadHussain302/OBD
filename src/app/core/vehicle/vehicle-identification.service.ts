import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { AdapterSwitcherService } from '../adapters/adapter-switcher.service';
import { VehicleProfileService } from './vehicle-profile.service';
import { VehicleIntelligenceService } from './vehicle-intelligence.service';
import { VehicleIntelligenceProfile } from './vehicle-intelligence.models';

export type VehicleIdentificationSource = 'local' | 'vin_lookup' | 'vin_pattern';

export type VehicleIdentificationState =
  | { status: 'loading' }
  | { status: 'found'; make: string; model: string; year?: number; fuelType?: string; source: VehicleIdentificationSource }
  | { status: 'not_found'; vin: string; vinPattern: string }
  | { status: 'vin_unavailable' };

@Injectable({ providedIn: 'root' })
export class VehicleIdentificationService implements OnDestroy {
  private readonly adapter = inject(AdapterSwitcherService);
  private readonly vehicleProfiles = inject(VehicleProfileService);
  private readonly vehicleIntelligence = inject(VehicleIntelligenceService);

  private readonly sub: Subscription;

  // Tracks which VIN the current in-flight lookup is for. Set to null when the
  // adapter emits null. Any await that completes and finds activeVin !== the VIN
  // it started with discards its result without writing state or localStorage.
  private activeVin: string | null = null;

  readonly state$ = new BehaviorSubject<VehicleIdentificationState>({ status: 'loading' });

  constructor() {
    this.sub = this.adapter.vinInfo$.subscribe(vinInfo => {
      if (vinInfo === null) {
        this.activeVin = null;
        this.state$.next({ status: 'vin_unavailable' });
      } else {
        void this.identify(vinInfo.vin);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private async identify(vin: string): Promise<void> {
    this.activeVin = vin;
    this.state$.next({ status: 'loading' });
    const vinPattern = vin.substring(0, 8);

    // 1. Local cache hit — skip network if VIN already confirmed
    const local = this.vehicleProfiles.getActiveProfile();
    if (local?.vin === vin) {
      this.state$.next({
        status: 'found',
        make: local.make,
        model: local.model,
        year: local.year || undefined,
        fuelType: local.fuelType,
        source: 'local',
      });
      return;
    }

    // 2. Exact VIN lookup in Firestore
    const byVin = await this.vehicleIntelligence.getProfileByVin(vin);
    if (this.activeVin !== vin) return;
    if (byVin) {
      this.cacheFirestoreProfile(byVin, vin, vinPattern, 'vin_lookup');
      this.state$.next({
        status: 'found',
        make: byVin.make,
        model: byVin.model,
        year: byVin.year,
        fuelType: byVin.fuelType,
        source: 'vin_lookup',
      });
      return;
    }

    // 3. VIN pattern lookup in Firestore
    const byPattern = await this.vehicleIntelligence.getProfileByVinPattern(vinPattern);
    if (this.activeVin !== vin) return;
    if (byPattern) {
      this.cacheFirestoreProfile(byPattern, vin, vinPattern, 'vin_pattern');
      this.state$.next({
        status: 'found',
        make: byPattern.make,
        model: byPattern.model,
        year: byPattern.year,
        fuelType: byPattern.fuelType,
        source: 'vin_pattern',
      });
      return;
    }

    // 4. No profile found anywhere
    this.state$.next({ status: 'not_found', vin, vinPattern });
  }

  private cacheFirestoreProfile(
    profile: VehicleIntelligenceProfile,
    vin: string,
    vinPattern: string,
    source: 'vin_lookup' | 'vin_pattern',
  ): void {
    const now = Date.now();
    this.vehicleProfiles.saveProfile({
      id: 'veh_' + now,
      make: profile.make,
      model: profile.model,
      year: profile.year ?? 0,
      trimVariant: '',
      engineSize: profile.engine ?? '',
      fuelType: profile.fuelType ?? 'unknown',
      transmission: 'unknown',
      vin,
      vinPattern,
      detectedProtocol: profile.protocol,
      source,
      reviewStatus: 'unreviewed',
      createdAt: now,
      updatedAt: now,
    });
  }
}
