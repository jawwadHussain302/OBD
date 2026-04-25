import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { MockObdAdapterService } from '../../core/adapters/mock-obd-adapter.service';
import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';
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
  private dataSub?: Subscription;

  constructor(private obdAdapter: MockObdAdapterService) {
    this.connectionStatus$ = this.obdAdapter.connectionStatus$;
  }

  ngOnInit(): void {
    // Connect on page load as requested
    this.obdAdapter.connect();

    this.dataSub = this.obdAdapter.data$.subscribe(frame => {
      this.latestFrame = frame;
    });
  }

  ngOnDestroy(): void {
    if (this.dataSub) {
      this.dataSub.unsubscribe();
    }
    this.obdAdapter.disconnect();
  }

  public setMode(mode: string): void {
    this.obdAdapter.setMockMode(mode as any);
  }
}
