import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FuelTrimTestPanelComponent } from './components/fuel-trim-test-panel/fuel-trim-test-panel.component';

@Component({
  selector: 'app-guided-tests-page',
  standalone: true,
  imports: [CommonModule, FuelTrimTestPanelComponent],
  template: `
    <div class="guided-tests-container">
      <div class="header">
        <h2>Guided Diagnostics</h2>
        <p>Interactive tests to help diagnose complex issues.</p>
      </div>

      <div class="layout">
        <div class="sidebar">
          <h3>Available Tests</h3>
          <ul class="test-list">
            <li [class.active]="activeTest === 'fuel-trim'" (click)="activeTest = 'fuel-trim'">
              Fuel Trim Analysis
            </li>
            <li class="disabled">
              Coolant / Thermostat Analysis <em>(Coming soon)</em>
            </li>
            <li class="disabled">
              Idle Stability Analysis <em>(Coming soon)</em>
            </li>
            <li class="disabled">
              MAF / MAP Sensor Sanity Check <em>(Coming soon)</em>
            </li>
          </ul>
        </div>
        
        <div class="main-content">
          <app-fuel-trim-test-panel *ngIf="activeTest === 'fuel-trim'"></app-fuel-trim-test-panel>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./guided-tests-page.component.scss']
})
export class GuidedTestsPageComponent {
  activeTest = 'fuel-trim';
}
