import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { RouterOutlet, Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { filter, map, startWith, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { VehicleProfileService } from './core/vehicle/vehicle-profile.service';
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
  private readonly destroy$ = new Subject<void>();

  readonly isAdmin = this.adminAccess.isAdmin;
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

  minimizeDiagnosisWidget(): void {
    this.widgetState.setMinimized(true);
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
        if (state.status === 'running' || state.status === 'transitioning') {
          this.widgetState.setMinimized(false);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
