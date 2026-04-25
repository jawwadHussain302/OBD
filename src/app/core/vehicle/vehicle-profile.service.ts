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

  private loadProfile() {
    const saved = localStorage.getItem('obd_active_vehicle');
    if (saved) {
      try {
        const profile = JSON.parse(saved);
        this.activeProfileSubject.next(profile);
      } catch (e) {
        console.error('Failed to parse saved vehicle profile', e);
      }
    }
  }

  saveProfile(profile: VehicleProfile) {
    if (!profile.id) {
      profile.id = 'veh_' + Date.now();
    }
    profile.updatedAt = Date.now();
    if (!profile.createdAt) {
      profile.createdAt = Date.now();
    }
    
    localStorage.setItem('obd_active_vehicle', JSON.stringify(profile));
    this.activeProfileSubject.next(profile);
  }

  getActiveProfile(): VehicleProfile | null {
    return this.activeProfileSubject.value;
  }
}
