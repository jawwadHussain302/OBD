import { NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DeepDiagnosisState } from '../../../core/diagnostics/deep-diagnosis.service';

@Component({
  selector: 'app-ongoing-diagnosis-widget',
  standalone: true,
  imports: [NgIf],
  templateUrl: './ongoing-diagnosis-widget.component.html',
  styleUrls: ['./ongoing-diagnosis-widget.component.scss']
})
export class OngoingDiagnosisWidgetComponent {
  @Input({ required: true }) state: DeepDiagnosisState | null = null;
  @Input() visible = false;
  @Output() open = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  titleFor(state: DeepDiagnosisState | null): string {
    if (!state) return 'Diagnosis';
    if (state.currentStep === 'driving_prompt') return 'Driving Analysis Prompt';
    if (state.status === 'completed' || state.currentStep === 'completed') return 'Diagnosis Complete';
    if (state.status === 'error') return 'Diagnosis Failed';
    return 'Full Diagnosis';
  }

  actionLabelFor(state: DeepDiagnosisState | null): string {
    if (!state) return 'Open';
    if (state.status === 'completed') return 'View Result';
    if (state.status === 'error') return 'View Details';
    return 'Open';
  }
}
