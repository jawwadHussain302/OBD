import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { VehicleProfile } from '../models/vehicle-profile.model';

@Injectable({
  providedIn: 'root'
})
export class VehicleProfileService {
  private activeProfileSubject = new BehaviorSubject<VehicleProfile | null>(null);
  public activeProfile$ = this.activeProfileSubject.asObservable();

  constructor() {
    this.loadProfile();
  }

  private loadProfile(): void {
    const saved = localStorage.getItem('obd_active_vehicle');
    if (saved) {
      try {
        const profile = JSON.parse(saved) as VehicleProfile;
        this.activeProfileSubject.next(profile);
      } catch (err) {
        console.error('Failed to parse saved vehicle profile', err);
      }
    }
  }

  saveProfile(profile: VehicleProfile): void {
    const now = Date.now();
    const nextProfile: VehicleProfile = {
      ...profile,
      id: profile.id || 'veh_' + now,
      createdAt: profile.createdAt || now,
      updatedAt: now,
    };
    
    localStorage.setItem('obd_active_vehicle', JSON.stringify(nextProfile));
    this.activeProfileSubject.next(nextProfile);
  }

  getActiveProfile(): VehicleProfile | null {
    return this.activeProfileSubject.value;
  }
}
