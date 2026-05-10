import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-diagnosis-assistant-page',
  standalone: true,
  templateUrl: './diagnosis-assistant-page.component.html',
  styleUrls: ['./diagnosis-assistant-page.component.scss'],
})
export class DiagnosisAssistantPageComponent {
  constructor(private router: Router) {}

  openFullDiagnosis(): void {
    this.router.navigate(['/diagnosis-report']);
  }

  openGuidedDiagnosis(): void {
    this.router.navigate(['/guided-tests']);
  }
}
