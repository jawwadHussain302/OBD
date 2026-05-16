import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';
import { VehicleIntelligenceService } from '../../core/vehicle/vehicle-intelligence.service';
import { VehicleProfile } from '../../core/models/vehicle-profile.model';
import { MAKE_NAMES, getModelsForMake, getYearRange } from '../../core/vehicle/vehicle-data';

type FuelType = VehicleProfile['fuelType'];
type FuelOption = { value: FuelType; label: string };

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
  private vehicleIntelligence = inject(VehicleIntelligenceService);

  readonly makes = MAKE_NAMES;
  readonly years = getYearRange();
  readonly fuelOptions: FuelOption[] = [
    { value: 'unknown',  label: 'Unknown' },
    { value: 'petrol',   label: 'Petrol' },
    { value: 'diesel',   label: 'Diesel' },
    { value: 'hybrid',   label: 'Hybrid' },
    { value: 'ev',       label: 'Electric (EV)' },
  ];

  selectedMake     = '';
  selectedModel    = '';
  selectedYear: number | null = null;
  selectedEngine   = '';
  selectedFuelType: FuelType = 'unknown';
  selectedProtocol = '';

  isSaving  = false;
  saveState: 'idle' | 'success' | 'error' = 'idle';
  errorMessage = '';

  get models(): string[] {
    return this.selectedMake ? getModelsForMake(this.selectedMake) : [];
  }

  get canSave(): boolean {
    return !this.isSaving && !!(this.selectedMake && this.selectedModel && this.selectedFuelType);
  }

  onMakeChange(): void {
    this.selectedModel = '';
  }

  async save(): Promise<void> {
    if (!this.canSave) return;

    this.isSaving  = true;
    this.saveState = 'idle';

    try {
      // Primary save: localStorage — always reliable.
      this.vehicleService.saveConfirmedProfile(
        {
          make:              this.selectedMake,
          model:             this.selectedModel,
          year:              this.selectedYear ?? 0,
          trimVariant:       '',
          engineSize:        this.selectedEngine,
          fuelType:          this.selectedFuelType,
          transmission:      'unknown',
          detectedProtocol:  this.selectedProtocol || undefined,
        },
        this.vin,
        this.vinPattern,
      );

      // Secondary save: Firestore via VehicleIntelligenceService — best-effort.
      // Awaited so isSaving stays true until the write resolves, preventing
      // duplicate submissions while the request is in flight.
      // Errors are caught inside the service so this never throws.
      await this.vehicleIntelligence.saveConfirmedProfile({
        make:       this.selectedMake,
        model:      this.selectedModel,
        year:       this.selectedYear ?? undefined,
        engine:     this.selectedEngine   || undefined,
        fuelType:   this.selectedFuelType as 'petrol' | 'diesel' | 'hybrid' | 'ev' | 'unknown',
        protocol:   this.selectedProtocol || undefined,
        vin:        this.vin,
        vinPattern: this.vinPattern,
      });

      this.saveState = 'success';
    } catch {
      this.saveState   = 'error';
      this.errorMessage = 'Failed to save vehicle profile. Please try again.';
    } finally {
      this.isSaving = false;
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
    this.isSaving         = false;
  }
}
