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
  templateUrl: './vehicle-profile-page.component.html',
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
