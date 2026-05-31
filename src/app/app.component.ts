import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { RouterOutlet, Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, Subject } from 'rxjs';
import { filter, map, startWith, takeUntil } from 'rxjs/operators';
import { VehicleProfileService } from './core/vehicle/vehicle-profile.service';
import { type VehicleProfile } from './core/models/vehicle-profile.model';
import { AdapterSwitcherService } from './core/adapters/adapter-switcher.service';
import { AdminAccessService } from './core/security/admin-access.service';
import { GlobalTelemetryDockComponent } from './shared/components/global-telemetry-dock/global-telemetry-dock.component';
import { OngoingDiagnosisWidgetComponent } from './shared/components/ongoing-diagnosis-widget/ongoing-diagnosis-widget.component';
import { DeepDiagnosisService } from './core/diagnostics/deep-diagnosis.service';
import { DiagnosisWidgetStateService } from './core/diagnostics/diagnosis-widget-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgIf, AsyncPipe, RouterOutlet, RouterLink, RouterLinkActive, GlobalTelemetryDockComponent, OngoingDiagnosisWidgetComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private vehicleService = inject(VehicleProfileService);
  private adapterSwitcher = inject(AdapterSwitcherService);
  private adminAccess = inject(AdminAccessService);
  private diagnosisService = inject(DeepDiagnosisService);
  private widgetState = inject(DiagnosisWidgetStateService);
  private lastDiagnosisRoute = '/diagnosis-report';
  private diagnosisWasActive = false;
  private currentDiagnosisState: { status: string } | null = null;
  private readonly unknownVehicleValues = new Set(['', 'unknown', 'n/a', 'na', 'none', 'null', 'undefined']);
  private readonly destroy$ = new Subject<void>();

  readonly isAdmin = this.adminAccess.isAdmin;
  readonly activeProfile$ = this.vehicleService.activeProfile$;
  readonly diagnosisState$ = this.diagnosisService.state$;
  readonly currentUrl$ = this.router.events.pipe(
    filter(e => e instanceof NavigationEnd),
    map(() => this.router.url),
    startWith(this.router.url),
  );
  readonly showTelemetryDock$ = this.currentUrl$.pipe(
    map(url => !url.startsWith('/dashboard')),
  );
  readonly widgetVisible$ = combineLatest([this.diagnosisState$, this.widgetState.minimized$, this.currentUrl$]).pipe(
    map(([state, minimized, url]) => {
      const isDiagnosisRunning = state.status === 'running' || state.status === 'transitioning';
      const showCompleted = state.status === 'completed' || state.status === 'error';
      const onDiagnosisPage = this.isDiagnosisDisplayRoute(url);
      return (isDiagnosisRunning || showCompleted) && !onDiagnosisPage && !minimized;
    }),
  );

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
    this.adapterSwitcher.autoConnect();
  }

  private isDiagnosisUrl(url = this.router.url): boolean {
    return url.startsWith('/diagnosis-assistant') ||
           url.startsWith('/ai-diagnosis-assistant') ||
           url.startsWith('/diagnosis-report') ||
           url.startsWith('/guided-tests');
  }

  private isDiagnosisDisplayRoute(url = this.router.url): boolean {
    return url.startsWith('/diagnosis-report') ||
           url.startsWith('/guided-tests') ||
           url.startsWith('/ai-diagnosis-assistant/catalytic-converter') ||
           url.startsWith('/ai-diagnosis-assistant/cylinder-analysis') ||
           url.startsWith('/ai-diagnosis-assistant/guided');
  }

  openDiagnosisWidget(): void {
    const target = this.isDiagnosisDisplayRoute(this.lastDiagnosisRoute) ? this.lastDiagnosisRoute : '/diagnosis-report';
    this.widgetState.setMinimized(false);
    this.router.navigate([target]);
  }

  closeDiagnosisWidget(): void {
    const isActive = this.currentDiagnosisState?.status === 'running' || this.currentDiagnosisState?.status === 'transitioning';

    if (!isActive) {
      this.widgetState.setMinimized(true);
      return;
    }

    const shouldStop = window.confirm('Stop the current diagnosis?');
    if (!shouldStop) {
      return;
    }

    this.diagnosisService.cancelDiagnosis();
    this.widgetState.setMinimized(true);
  }

  vehicleTitle(profile: VehicleProfile): string {
    const title = [
      this.cleanVehicleValue(profile.make),
      this.cleanVehicleValue(profile.model),
    ].filter((part): part is string => Boolean(part));

    return title.length ? title.join(' ') : 'Unknown vehicle';
  }

  vehicleDetails(profile: VehicleProfile): string {
    const variantEngine = [
      this.cleanVehicleValue(profile.trimVariant),
      this.cleanVehicleValue(profile.engineSize),
    ].filter((part): part is string => Boolean(part));

    const details = [
      this.cleanYear(profile.year),
      variantEngine.join(' / ') || null,
      this.formatFuelType(profile.fuelType),
    ].filter((part): part is string => Boolean(part));

    return details.length ? details.join(' • ') : 'Details unavailable';
  }

  vehicleProtocol(profile: VehicleProfile): string | null {
    return this.cleanVehicleValue(profile.detectedProtocol);
  }

  ngOnInit(): void {
    this.currentUrl$
      .pipe(takeUntil(this.destroy$))
      .subscribe((url) => {
        if (this.isDiagnosisDisplayRoute(url)) {
          this.lastDiagnosisRoute = url;
        }
      });

    this.diagnosisState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.currentDiagnosisState = state;
        const diagnosisIsActive = state.status === 'running' || state.status === 'transitioning';

        if (diagnosisIsActive && !this.diagnosisWasActive) {
          this.widgetState.setMinimized(false);
        }

        this.diagnosisWasActive = diagnosisIsActive;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private cleanYear(year: number | null | undefined): string | null {
    return typeof year === 'number' && Number.isFinite(year) && year > 0
      ? String(year)
      : null;
  }

  private cleanVehicleValue(value: string | number | null | undefined): string | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : null;
    }

    const trimmed = value?.trim();
    if (!trimmed || this.unknownVehicleValues.has(trimmed.toLowerCase())) {
      return null;
    }

    return trimmed;
  }

  private formatFuelType(fuelType: VehicleProfile['fuelType']): string | null {
    switch (fuelType) {
      case 'petrol':
        return 'Petrol';
      case 'diesel':
        return 'Diesel';
      case 'hybrid':
        return 'Hybrid';
      case 'electric':
      case 'ev':
        return 'EV';
      default:
        return null;
    }
  }
}
