import { Component, inject } from '@angular/core';
import { RouterOutlet, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { VehicleProfileService } from './core/vehicle/vehicle-profile.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-layout">
      <nav class="sidebar">
        <div class="logo">
          <h2>OBD2 Dash</h2>
        </div>
        <ul class="nav-links">
          <li><a routerLink="/dashboard" routerLinkActive="active">Dashboard</a></li>
          <li><a routerLink="/guided-tests" routerLinkActive="active">Guided Tests</a></li>
          <li><a routerLink="/sessions" routerLinkActive="active">Sessions</a></li>
          <li><a routerLink="/vehicle-profile" routerLinkActive="active">Vehicle Profile</a></li>
        </ul>
      </nav>
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  private router = inject(Router);
  private vehicleService = inject(VehicleProfileService);

  constructor() {
    // If no vehicle profile, redirect to setup
    if (!this.vehicleService.getActiveProfile()) {
      this.router.navigate(['/vehicle-profile']);
    }
  }
}
