import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-diagnosis-assistant-page',
  standalone: true,
  templateUrl: './diagnosis-assistant-page.component.html',
  styleUrls: ['./diagnosis-assistant-page.component.scss'],
})
export class DiagnosisAssistantPageComponent {
  private router = inject(Router);

  openFullDiagnosis(): void {
    this.router.navigate(['/ai-diagnosis-assistant/full']);
  }

  openCylinderAnalysis(): void {
    this.router.navigate(['/ai-diagnosis-assistant/cylinder-analysis']);
  }

  openCatalyticConverter(): void {
    this.router.navigate(['/ai-diagnosis-assistant/catalytic-converter']);
  }
}
