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
  // ── Diagnosis Assistant (unified hub) ─────────────────────────────────────
  {
    path: 'diagnosis-assistant',
    providers: [provideCharts(withDefaultRegisterables())],
    loadComponent: () => import('./features/diagnosis-assistant/diagnosis-assistant-page.component')
      .then(m => m.DiagnosisAssistantPageComponent)
  },
  {
    path: 'ai-diagnosis-assistant',
    redirectTo: 'diagnosis-assistant',
    pathMatch: 'full'
  },
  {
    path: 'ai-diagnosis-assistant/full',
    redirectTo: 'diagnosis-report',
    pathMatch: 'full'
  },
  {
    path: 'ai-diagnosis-assistant/catalytic-converter',
    loadComponent: () => import('./features/catalytic-converter/catalytic-converter-page.component')
      .then(m => m.CatalyticConverterPageComponent)
  },
  {
    path: 'ai-diagnosis-assistant/cylinder-analysis',
    loadComponent: () => import('./features/cylinder-analysis/cylinder-analysis-page.component')
      .then(m => m.CylinderAnalysisPageComponent)
  },
  // ── Guided Diagnosis — pack list and per-pack runner ───────────────────────
  {
    path: 'ai-diagnosis-assistant/guided',
    loadComponent: () => import('./features/guided-pack-list/guided-pack-list-page.component')
      .then(m => m.GuidedPackListPageComponent)
  },
  {
    path: 'ai-diagnosis-assistant/guided/:packId',
    loadComponent: () => import('./features/guided-pack-runner/guided-pack-runner-page.component')
      .then(m => m.GuidedPackRunnerPageComponent)
  },
  // ── Legacy routes — kept so bookmarks and deep-links still work ───────────
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
    path: 'admin/dtc-review',
    loadComponent: () => import('./features/admin-dtc-review/admin-dtc-review-page.component')
      .then(m => m.AdminDtcReviewPageComponent)
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
