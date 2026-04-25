import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { MockObdAdapterService } from '../../core/adapters/mock-obd-adapter.service';
import { DiagnosticEngineService } from '../../core/diagnostics/diagnostic-engine.service';
import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';
import { DiagnosticResult } from '../../core/models/diagnostic-result.model';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, MetricCardComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss']
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  public latestFrame: ObdLiveFrame | null = null;
  public connectionStatus$: Observable<string>;
  public activeResults$: Observable<DiagnosticResult[]>;
  private dataSub?: Subscription;

  constructor(
    private obdAdapter: MockObdAdapterService,
    private diagnosticEngine: DiagnosticEngineService
  ) {
    this.connectionStatus$ = this.obdAdapter.connectionStatus$;
    this.activeResults$ = this.diagnosticEngine.activeResults$;
  }

  ngOnInit(): void {
    // Start diagnostic session
    this.diagnosticEngine.startSession();
    
    // Automatically connect the mock adapter for demonstration
    this.obdAdapter.connect();

    this.dataSub = this.obdAdapter.data$.subscribe(frame => {
      this.latestFrame = frame;
      if (frame) {
        // Feed data into the diagnostic engine
        this.diagnosticEngine.processFrame(frame);
      }
    });
  }

  ngOnDestroy(): void {
    this.diagnosticEngine.stopSession();
    if (this.dataSub) {
      this.dataSub.unsubscribe();
    }
  }

  public setMode(mode: string): void {
    this.obdAdapter.setMockMode(mode as any);
  }
}
