import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';
import { VehicleIdentificationService, VehicleIdentificationState } from '../../core/vehicle/vehicle-identification.service';
import { ManualVehicleSetupComponent } from './manual-vehicle-setup.component';

@Component({
  selector: 'app-vehicle-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ManualVehicleSetupComponent],
  templateUrl: './vehicle-profile-page.component.html',
  styleUrls: ['./vehicle-profile-page.component.scss'],
})
export class VehicleProfilePageComponent implements OnInit, OnDestroy {
  private vehicleService = inject(VehicleProfileService);
  private vehicleIdentification = inject(VehicleIdentificationService);

  private idSub?: Subscription;
  hasAttemptedVin = false;

  idState: VehicleIdentificationState = { status: 'loading' };

  get foundSourceLabel(): string {
    if (this.idState.status !== 'found') return '';
    switch (this.idState.source) {
      case 'local':       return 'Saved locally';
      case 'vin_lookup':  return 'Matched via VIN';
      case 'vin_pattern': return 'Matched via VIN pattern';
    }
  }

  get fallbackVin(): string {
    return this.idState.status === 'not_found' ? this.idState.vin : '';
  }

  get fallbackVinPattern(): string {
    return this.idState.status === 'not_found' ? this.idState.vinPattern : '';
  }

  get identifiedFuelType(): 'petrol' | 'diesel' | 'hybrid' | 'ev' | 'unknown' {
    if (this.idState.status !== 'found') return 'unknown';
    if (this.idState.fuelType === 'petrol' || this.idState.fuelType === 'diesel' ||
      this.idState.fuelType === 'hybrid' || this.idState.fuelType === 'ev') {
      return this.idState.fuelType;
    }
    return 'unknown';
  }

  get manualBannerText(): string {
    if (this.hasAttemptedVin && this.idState.status === 'not_found') {
      return 'Vehicle not found. Select details manually and we\'ll remember it for future diagnosis.';
    }
    if (this.hasAttemptedVin && this.idState.status === 'vin_unavailable') {
      return 'VIN unavailable. Select your vehicle manually to continue.';
    }
    return '';
  }

  async connectUsingVin(): Promise<void> {
    this.hasAttemptedVin = true;
    await this.vehicleIdentification.identifyConnectedVehicle();
  }

  ngOnInit(): void {
    const profile = this.vehicleService.getActiveProfile();
    this.idState = profile
      ? {
          status: 'found',
          make: profile.make,
          model: profile.model,
          year: profile.year,
          engine: profile.engineSize,
          fuelType: profile.fuelType,
          protocol: profile.detectedProtocol,
          source: 'local',
        }
      : { status: 'idle' };

    this.idSub = this.vehicleIdentification.state$.subscribe(state => {
      this.idState = state;
    });
  }

  ngOnDestroy(): void {
    this.idSub?.unsubscribe();
  }
}
