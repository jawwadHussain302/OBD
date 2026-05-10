import { Component, inject } from '@angular/core';
import { RouterOutlet, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { VehicleProfileService } from './core/vehicle/vehicle-profile.service';
import { AdapterSwitcherService } from './core/adapters/adapter-switcher.service';

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
  private adapterSwitcher = inject(AdapterSwitcherService);

  constructor() {
    if (!this.vehicleService.getActiveProfile()) {
      this.router.navigate(['/vehicle-profile']);
    }
    // Restore last adapter mode and reconnect simulator across page refreshes
    this.adapterSwitcher.autoConnect();
  }
}
