import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { MockObdAdapterService, MockMode } from '../../core/adapters/mock-obd-adapter.service';
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
  public diagnosticResults: DiagnosticResult[] = [];
  public dataState: 'no_data' | 'receiving' = 'no_data';
  
  private frames: ObdLiveFrame[] = [];
  private subscriptions = new Subscription();

  constructor(
    private obdAdapter: MockObdAdapterService,
    private diagnosticEngine: DiagnosticEngineService
  ) {
    this.connectionStatus$ = this.obdAdapter.connectionStatus$;
  }

  public ngOnInit(): void {
    // 1. Start diagnostic session
    this.diagnosticEngine.startSession();

    // 2. Connect to mock adapter
    this.obdAdapter.connect();

    // 3. Subscribe to live data stream
    const dataSubscription = this.obdAdapter.data$.subscribe({
      next: (frame: ObdLiveFrame) => {
        this.handleNewFrame(frame);
      }
    });

    // 4. Subscribe to diagnostic results (once in ngOnInit)
    const diagSubscription = this.diagnosticEngine.activeResults$.subscribe({
      next: (results: DiagnosticResult[]) => {
        this.diagnosticResults = this.deduplicateResults(results);
      }
    });

    this.subscriptions.add(dataSubscription);
    this.subscriptions.add(diagSubscription);
  }

  public ngOnDestroy(): void {
    this.diagnosticEngine.stopSession();
    this.subscriptions.unsubscribe();
  }

  private handleNewFrame(frame: ObdLiveFrame): void {
    this.latestFrame = frame;
    this.dataState = 'receiving';

    // 6. Keep only latest 20 frames locally
    this.frames.push(frame);
    if (this.frames.length > 20) {
      this.frames.shift();
    }

    // 5. Call DiagnosticEngineService only after at least 5 frames exist
    if (this.frames.length >= 5) {
      this.diagnosticEngine.processFrame(frame);
    }
  }

  private deduplicateResults(results: DiagnosticResult[]): DiagnosticResult[] {
    const uniqueMap = new Map<string, DiagnosticResult>();
    results.forEach(result => {
      uniqueMap.set(result.issueId, result);
    });
    return Array.from(uniqueMap.values());
  }

  public setMode(mode: string): void {
    // Reset buffer when switching modes to ensure data purity
    this.frames = [];
    this.dataState = 'no_data';
    this.diagnosticResults = [];
    this.obdAdapter.setMockMode(mode as MockMode);
  }
}
