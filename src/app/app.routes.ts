import { Routes } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

export const routes: Routes = [
  {
    path: 'vehicle-profile',
    loadComponent: () => import('./features/vehicle-profile/vehicle-profile-page.component')
      .then(m => m.VehicleProfilePageComponent)
  },
  {
    path: 'dashboard',
    providers: [provideCharts(withDefaultRegisterables())],
    loadComponent: () => import('./features/dashboard/dashboard-page.component')
      .then(m => m.DashboardPageComponent)
  },
  {
    path: 'guided-tests',
    providers: [provideCharts(withDefaultRegisterables())],
    loadComponent: () => import('./features/guided-tests/guided-tests-page.component')
      .then(m => m.GuidedTestsPageComponent)
  },
  {
    path: 'diagnosis-report',
    loadComponent: () => import('./features/diagnosis-report/diagnosis-report-page.component')
      .then(m => m.DiagnosisReportPageComponent)
  },
  {
    path: 'sessions',
    loadComponent: () => import('./features/sessions/session-summary.component')
      .then(m => m.SessionSummaryComponent)
  },
  {
    path: 'session-replay',
    loadComponent: () => import('./features/session-replay/session-replay.component')
      .then(m => m.SessionReplayComponent)
  },
  {
    path: 'ble-debug',
    loadComponent: () => import('./features/ble-debug/ble-debug.component')
      .then(m => m.BleDebugComponent)
  },
  {
    path: '',
    redirectTo: 'vehicle-profile',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'vehicle-profile'
  }
];
