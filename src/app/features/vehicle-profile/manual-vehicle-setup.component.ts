import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';
import { VehicleProfile } from '../../core/models/vehicle-profile.model';
import { MAKE_NAMES, getModelsForMake, getYearRange } from '../../core/vehicle/vehicle-data';

type FuelOption = { value: VehicleProfile['fuelType']; label: string };

@Component({
  selector: 'app-manual-vehicle-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manual-vehicle-setup.component.html',
  styleUrls: ['./manual-vehicle-setup.component.scss'],
})
export class ManualVehicleSetupComponent {
  @Input() vin?: string;
  @Input() vinPattern?: string;

  private vehicleService = inject(VehicleProfileService);

  readonly makes = MAKE_NAMES;
  readonly years = getYearRange();
  readonly fuelOptions: FuelOption[] = [
    { value: 'unknown',  label: 'Unknown' },
    { value: 'petrol',   label: 'Petrol' },
    { value: 'diesel',   label: 'Diesel' },
    { value: 'hybrid',   label: 'Hybrid' },
    { value: 'electric', label: 'Electric (EV)' },
  ];

  selectedMake     = '';
  selectedModel    = '';
  selectedYear: number | null = null;
  selectedEngine   = '';
  selectedFuelType: VehicleProfile['fuelType'] = 'unknown';
  selectedProtocol = '';

  saveState: 'idle' | 'success' | 'error' = 'idle';
  errorMessage = '';

  get models(): string[] {
    return this.selectedMake ? getModelsForMake(this.selectedMake) : [];
  }

  get canSave(): boolean {
    return !!(this.selectedMake && this.selectedModel && this.selectedFuelType);
  }

  onMakeChange(): void {
    this.selectedModel = '';
  }

  save(): void {
    if (!this.canSave) return;

    try {
      this.vehicleService.saveConfirmedProfile(
        {
          make: this.selectedMake,
          model: this.selectedModel,
          year: this.selectedYear ?? 0,
          trimVariant: '',
          engineSize: this.selectedEngine,
          fuelType: this.selectedFuelType,
          transmission: 'unknown',
          detectedProtocol: this.selectedProtocol || undefined,
        },
        this.vin,
        this.vinPattern,
      );
      this.saveState = 'success';
    } catch {
      this.saveState = 'error';
      this.errorMessage = 'Failed to save vehicle profile. Please try again.';
    }
  }

  reset(): void {
    this.selectedMake     = '';
    this.selectedModel    = '';
    this.selectedYear     = null;
    this.selectedEngine   = '';
    this.selectedFuelType = 'unknown';
    this.selectedProtocol = '';
    this.saveState        = 'idle';
    this.errorMessage     = '';
  }
}
