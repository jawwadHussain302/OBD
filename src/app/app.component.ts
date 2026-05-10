import { Component, inject } from '@angular/core';
import { RouterOutlet, Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
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

  // True whenever the user is anywhere inside the diagnosis flows —
  // /diagnosis-assistant, /diagnosis-report, or /guided-tests.
  readonly diagnosisActive = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.isDiagnosisUrl()),
      startWith(this.isDiagnosisUrl()),
    ),
    { initialValue: false }
  );

  constructor() {
    if (!this.vehicleService.getActiveProfile()) {
      this.router.navigate(['/vehicle-profile']);
    }
    // Restore last adapter mode and reconnect simulator across page refreshes
    this.adapterSwitcher.autoConnect();
  }

  private isDiagnosisUrl(): boolean {
    const url = this.router.url;
    return url.startsWith('/diagnosis-assistant') ||
           url.startsWith('/diagnosis-report') ||
           url.startsWith('/guided-tests');
  }
}
