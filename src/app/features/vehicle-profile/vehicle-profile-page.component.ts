import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';
import { VehicleProfile } from '../../core/models/vehicle-profile.model';

@Component({
  selector: 'app-vehicle-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page-container">
      <h2>Vehicle Profile Setup</h2>
      <p class="subtitle">Set up the vehicle you are working on to ensure accurate diagnostics.</p>

      <form [formGroup]="profileForm" (ngSubmit)="onSubmit()" class="profile-form">
        
        <div class="form-row">
          <div class="form-group">
            <label>Make</label>
            <input type="text" formControlName="make" placeholder="e.g. Honda">
          </div>
          <div class="form-group">
            <label>Model</label>
            <input type="text" formControlName="model" placeholder="e.g. Accord">
          </div>
          <div class="form-group">
            <label>Year</label>
            <input type="number" formControlName="year" placeholder="e.g. 2018">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Trim / Variant</label>
            <input type="text" formControlName="trimVariant" placeholder="e.g. EX-L">
          </div>
          <div class="form-group">
            <label>Engine Size</label>
            <input type="text" formControlName="engineSize" placeholder="e.g. 2.4L">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Fuel Type</label>
            <select formControlName="fuelType">
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="hybrid">Hybrid</option>
              <option value="electric">Electric</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div class="form-group">
            <label>Transmission</label>
            <select formControlName="transmission">
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
              <option value="cvt">CVT</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>VIN (Optional)</label>
            <div class="vin-input-group">
              <input type="text" formControlName="vin" placeholder="17-character VIN">
              <button type="button" class="btn-secondary" (click)="readVin()">Read VIN from OBD</button>
            </div>
            <small *ngIf="showVinWarning" class="warning-text">VIN reading will be enabled when real OBD adapter is connected. Mocking for now.</small>
          </div>
        </div>

        <div class="form-group">
          <label>Notes</label>
          <textarea formControlName="notes" rows="3" placeholder="Any specific issues reported?"></textarea>
        </div>

        <div class="actions">
          <button type="submit" class="btn-primary" [disabled]="!profileForm.valid">Save & Continue</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['./vehicle-profile-page.component.scss']
})
export class VehicleProfilePageComponent {
  private fb = inject(FormBuilder);
  private vehicleService = inject(VehicleProfileService);
  private router = inject(Router);

  showVinWarning = false;

  profileForm = this.fb.group({
    id: [''],
    make: ['', Validators.required],
    model: ['', Validators.required],
    year: [new Date().getFullYear(), [Validators.required, Validators.min(1996)]],
    trimVariant: [''],
    engineSize: [''],
    fuelType: ['petrol'],
    transmission: ['automatic'],
    vin: [''],
    notes: ['']
  });

  constructor() {
    const active = this.vehicleService.getActiveProfile();
    if (active) {
      this.profileForm.patchValue(active);
    }
  }

  readVin() {
    this.showVinWarning = true;
    setTimeout(() => {
      this.profileForm.patchValue({ vin: '1HGCM82633A00435' });
      this.showVinWarning = false;
    }, 1500);
  }

  onSubmit() {
    if (this.profileForm.valid) {
      this.vehicleService.saveProfile(this.profileForm.value as VehicleProfile);
      this.router.navigate(['/dashboard']);
    }
  }
}
