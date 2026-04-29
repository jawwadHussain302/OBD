import { Injectable } from '@angular/core';
import { DiagnosisStepId } from '../deep-diagnosis.service';
import { TimelineEvent } from './diagnosis-intelligence.models';

const STEP_MESSAGES: Partial<Record<DiagnosisStepId, string>> = {
  baseline_scan:     'Baseline scan started — collecting initial engine data.',
  warmup_monitoring: 'Warm-up monitoring started — waiting for engine to reach operating temperature.',
  idle_test:         'Idle stability test started.',
  rev_test:          'Engine response test started.',
  driving_prompt:    'Driving analysis stage reached.',
  driving_analysis:  'Driving analysis in progress.',
  completed:         'Diagnosis completed.',
  cancelled:         'Diagnosis cancelled by user.',
  error:             'Diagnosis stopped due to an error.',
};

@Injectable({ providedIn: 'root' })
export class DiagnosisTimelineService {

  private events: TimelineEvent[] = [];

  reset(): void {
    this.events = [];
  }

  log(step: DiagnosisStepId, message?: string): TimelineEvent {
    const event: TimelineEvent = {
      timestamp: Date.now(),
      step,
      message: message ?? STEP_MESSAGES[step] ?? step,
    };
    this.events.push(event);
    return event;
  }

  getEvents(): TimelineEvent[] {
    return [...this.events];
  }
}
