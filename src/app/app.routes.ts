import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'vehicle-profile',
    loadComponent: () => import('./features/vehicle-profile/vehicle-profile-page.component')
      .then(m => m.VehicleProfilePageComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard-page.component')
      .then(m => m.DashboardPageComponent)
  },
  {
    path: 'guided-tests',
    loadComponent: () => import('./features/guided-tests/guided-tests-page.component')
      .then(m => m.GuidedTestsPageComponent)
  },
  {
    path: 'sessions',
    loadComponent: () => import('./features/sessions/session-summary.component')
      .then(m => m.SessionSummaryComponent)
  },
  {
    path: '',
    redirectTo: '/vehicle-profile',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/vehicle-profile'
  }
];
