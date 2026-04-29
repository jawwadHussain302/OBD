import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';
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

@Component({
  selector: 'app-vehicle-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vehicle-profile-page.component.html',
  styleUrls: ['./vehicle-profile-page.component.scss'],
})
export class VehicleProfilePageComponent {
  private vehicleService = inject(VehicleProfileService);
  private router = inject(Router);

  readonly makes = MAKE_NAMES;
  readonly years = getYearRange();

  selectedMake = '';
  selectedModel = '';
  selectedYear: number | null = null;

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
    if (profile) {
      this.selectedMake = profile.make;
      this.selectedModel = profile.model;
      this.selectedYear = profile.year;
    }
  }
}
