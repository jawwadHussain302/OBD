import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FuelTrimTestPanelComponent } from './components/fuel-trim-test-panel/fuel-trim-test-panel.component';

@Component({
  selector: 'app-guided-tests-page',
  standalone: true,
  imports: [CommonModule, FuelTrimTestPanelComponent],
  templateUrl: './guided-tests-page.component.html',
  styleUrls: ['./guided-tests-page.component.scss']
})
export class GuidedTestsPageComponent {
  activeTest = 'fuel-trim';
}
