import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';
import { VehicleIdentificationService, VehicleIdentificationState } from '../../core/vehicle/vehicle-identification.service';
import { VehicleProfile } from '../../core/models/vehicle-profile.model';
import {
  MAKE_NAMES,
  getModelsForMake,
  getYearRange,
} from '../../core/vehicle/vehicle-data';
import {
  ConnectionProfile,
  deriveConnectionProfile,
} from '../../core/vehicle/connection-profile';
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
  private router = inject(Router);

  private idSub?: Subscription;

  readonly makes = MAKE_NAMES;
  readonly years = getYearRange();

  selectedMake = '';
  selectedModel = '';
  selectedYear: number | null = null;

  activeProfile: VehicleProfile | null = null;
  idState: VehicleIdentificationState = { status: 'loading' };

  get models(): string[] {
    return this.selectedMake ? getModelsForMake(this.selectedMake) : [];
  }

  get connectionProfile(): ConnectionProfile | null {
    if (this.selectedMake && this.selectedYear) {
      return deriveConnectionProfile(this.selectedYear, this.selectedMake);
    }
    return null;
  }

  get canConnect(): boolean {
    return !!(this.selectedMake && this.selectedModel && this.selectedYear);
  }

  get foundSourceLabel(): string {
    if (this.idState.status !== 'found') return '';
    switch (this.idState.source) {
      case 'local':       return 'Saved locally';
      case 'vin_lookup':  return 'Matched via VIN';
      case 'vin_pattern': return 'Matched via VIN pattern';
    }
  }

  get notFoundVin(): string {
    return this.idState.status === 'not_found' ? this.idState.vin : '';
  }

  get notFoundVinPattern(): string {
    return this.idState.status === 'not_found' ? this.idState.vinPattern : '';
  }

  onMakeChange(): void {
    this.selectedModel = '';
    this.selectedYear = null;
  }

  onModelChange(): void {
    this.selectedYear = null;
  }

  saveAndDiagnose(): void {
    if (!this.canConnect) return;

    const existing = this.vehicleService.getActiveProfile();
    const profile: VehicleProfile = {
      id: existing?.id ?? '',
      make: this.selectedMake,
      model: this.selectedModel,
      year: this.selectedYear!,
      trimVariant: '',
      engineSize: '',
      fuelType: 'unknown',
      transmission: 'unknown',
      createdAt: existing?.createdAt ?? 0,
      updatedAt: 0,
    };

    this.vehicleService.saveProfile(profile);
    this.router.navigate(['/diagnosis-report']);
  }

  ngOnInit(): void {
    const profile = this.vehicleService.getActiveProfile();
    this.activeProfile = profile;
    if (profile) {
      this.selectedMake = profile.make;
      this.selectedModel = profile.model;
      this.selectedYear = profile.year;
    }

    this.idSub = this.vehicleIdentification.state$.subscribe(state => {
      this.idState = state;
    });
  }

  ngOnDestroy(): void {
    this.idSub?.unsubscribe();
  }
}
