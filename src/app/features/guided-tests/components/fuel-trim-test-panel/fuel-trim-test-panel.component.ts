import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { FuelTrimTestService, FuelTrimTestStep } from '../../../../core/test-orchestrator/fuel-trim-test.service';
import { ObdAdapter, OBD_ADAPTER } from '../../../../core/adapters/obd-adapter.interface';
import { GuidedTestResult } from '../../../../core/models/guided-test.model';
import { ObdLiveFrame } from '../../../../core/models/obd-live-frame.model';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { MiniGraphComponent } from '../../../../shared/components/mini-graph/mini-graph.component';

@Component({
  selector: 'app-fuel-trim-test-panel',
  standalone: true,
  imports: [CommonModule, DecimalPipe, StatusBadgeComponent, MiniGraphComponent],
  templateUrl: './fuel-trim-test-panel.component.html',
  styleUrls: ['./fuel-trim-test-panel.component.scss']
})
export class FuelTrimTestPanelComponent implements OnInit, OnDestroy {
  fuelTrimTest = inject(FuelTrimTestService);
  obdAdapter: ObdAdapter = inject(OBD_ADAPTER);

  status = 'disconnected';
  step: FuelTrimTestStep = 'not_started';
  instruction = '';
  progress = 0;
  result: GuidedTestResult | null = null;
  rpm: number | null = null;
  frames: ObdLiveFrame[] = [];

  private subs: Subscription[] = [];
  private lastTime = Date.now();

  ngOnInit(): void {
    this.subs.push(
      this.obdAdapter.connectionStatus$.subscribe(s => this.status = s),
      this.fuelTrimTest.step$.subscribe(s => this.step = s),
      this.fuelTrimTest.instruction$.subscribe(i => this.instruction = i),
      this.fuelTrimTest.progress$.subscribe(p => this.progress = p),
      this.fuelTrimTest.result$.subscribe(r => this.result = r),
      this.obdAdapter.data$.subscribe(frame => {
        this.frames = [...this.frames, frame].slice(-20);
        this.rpm = frame.rpm;
        const now = Date.now();
        const dt = now - this.lastTime;
        this.lastTime = now;
        this.fuelTrimTest.processFrame(frame, dt);
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  startTest(): void {
    this.frames = [];
    this.fuelTrimTest.startTest();
    this.lastTime = Date.now();
  }

  isStepCompleted(checkStep: string): boolean {
    const order = ['not_started', 'idle_1', 'raised_rpm', 'idle_2', 'completed'];
    return order.indexOf(this.step) > order.indexOf(checkStep);
  }
}
