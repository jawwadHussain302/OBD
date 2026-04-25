import { Component, inject } from '@angular/core';
import { RouterOutlet, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { VehicleProfileService } from './core/vehicle/vehicle-profile.service';

/**
 * Root component of the OBD2 Diagnostic Dashboard.
 * Handles initial redirection to vehicle setup if no profile exists.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  private router = inject(Router);
  private vehicleService = inject(VehicleProfileService);

  constructor() {
    // Redirect to vehicle setup if no active profile is found
    if (!this.vehicleService.getActiveProfile()) {
      this.router.navigate(['/vehicle-profile']);
    }
  }
}
