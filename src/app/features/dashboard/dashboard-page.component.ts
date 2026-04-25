import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription, BehaviorSubject } from 'rxjs';
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
  
  // Local state for diagnostics to ensure stabilization
  private frames: ObdLiveFrame[] = [];
  private diagnosticResultsSubject = new BehaviorSubject<DiagnosticResult[]>([]);
  public activeResults$ = this.diagnosticResultsSubject.asObservable();
  
  public dataState: 'no_data' | 'receiving' = 'no_data';
  private subscriptions: Subscription = new Subscription();

  constructor(
    private obdAdapter: MockObdAdapterService,
    private diagnosticEngine: DiagnosticEngineService
  ) {
    this.connectionStatus$ = this.obdAdapter.connectionStatus$;
  }

  ngOnInit(): void {
    // Start diagnostic session
    this.diagnosticEngine.startSession();
    
    // Automatically connect on page load
    this.obdAdapter.connect();

    // Subscribe to live data stream
    const dataSub = this.obdAdapter.data$.subscribe(frame => {
      this.handleNewFrame(frame);
    });
    this.subscriptions.add(dataSub);
  }

  ngOnDestroy(): void {
    this.diagnosticEngine.stopSession();
    this.subscriptions.unsubscribe(); // Prevent memory leaks
  }

  private handleNewFrame(frame: ObdLiveFrame | null): void {
    if (!frame) return;

    this.latestFrame = frame;
    this.dataState = 'receiving';

    // 1. Maintain recent frame buffer (Limit to 20)
    this.frames.push(frame);
    if (this.frames.length > 20) {
      this.frames.shift();
    }

    // 3. Only run diagnostics when we have enough context (at least 5 frames)
    if (this.frames.length >= 5) {
      this.runDiagnostics();
    }
  }

  private runDiagnostics(): void {
    // We pass the latest frame to the engine which internally manages its own processing
    // But for this stabilization task, we can also use our local buffer if needed.
    this.diagnosticEngine.processFrame(this.latestFrame!);
    
    // Get results from the engine
    const results = this.diagnosticEngine.activeResults$.getValue();
    
    // 2. Prevent duplicate diagnostic alerts by issueId
    const uniqueResults = this.deduplicateResults(results);
    this.diagnosticResultsSubject.next(uniqueResults);
  }

  private deduplicateResults(results: DiagnosticResult[]): DiagnosticResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.issueId)) return false;
      seen.add(r.issueId);
      return true;
    });
  }

  public setMode(mode: string): void {
    // Reset buffer when switching modes to avoid mixing data
    this.frames = [];
    this.dataState = 'no_data';
    this.diagnosticResultsSubject.next([]);
    this.obdAdapter.setMockMode(mode as any);
  }
}
