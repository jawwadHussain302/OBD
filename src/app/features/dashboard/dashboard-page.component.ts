import { Component, OnInit, OnDestroy, inject, ViewChildren, QueryList } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { Subscription } from 'rxjs';

import { MockObdAdapterService, MockMode } from '../../core/adapters/mock-obd-adapter.service';
import { DiagnosticEngineService } from '../../core/diagnostics/diagnostic-engine.service';
import { SessionRecorderService } from '../../core/session/session-recorder.service';
import { VehicleProfileService } from '../../core/vehicle/vehicle-profile.service';

import { ObdLiveFrame } from '../../core/models/obd-live-frame.model';
import { DiagnosticResult } from '../../core/models/diagnostic-result.model';

import { MetricCardComponent } from '../../shared/components/metric-card/metric-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective, MetricCardComponent, StatusBadgeComponent, DecimalPipe],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss']
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  vehicleService = inject(VehicleProfileService);
  obdAdapter = inject(MockObdAdapterService);
  diagnosticEngine = inject(DiagnosticEngineService);
  sessionRecorder = inject(SessionRecorderService);

  vehicle = this.vehicleService.getActiveProfile();
  status = 'disconnected';
  currentMode: MockMode = 'normal';
  isRecording = false;

  latestFrame: ObdLiveFrame | null = null;
  diagnosticResults: DiagnosticResult[] = [];

  private subs: Subscription[] = [];
  
  @ViewChildren(BaseChartDirective) charts?: QueryList<BaseChartDirective>;
  
  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { display: false },
      y: { grid: { color: '#333' }, ticks: { color: '#aaa' } }
    },
    plugins: {
      legend: { labels: { color: '#aaa' } }
    }
  };

  trimChartData: ChartConfiguration['data'] = {
    datasets: [
      { data: [], label: 'STFT', borderColor: '#4CAF50', tension: 0.2, pointRadius: 0 },
      { data: [], label: 'LTFT', borderColor: '#2196F3', tension: 0.2, pointRadius: 0 }
    ],
    labels: []
  };

  rpmChartData: ChartConfiguration['data'] = {
    datasets: [
      { data: [], label: 'RPM', borderColor: '#ff9800', tension: 0.2, pointRadius: 0 }
    ],
    labels: []
  };

  ngOnInit() {
    this.currentMode = this.obdAdapter.getMockMode();
    this.setupSubscriptions();
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.diagnosticEngine.stopSession();
  }

  private setupSubscriptions() {
    this.subs.push(
      this.obdAdapter.connectionStatus$.subscribe(status => this.handleConnectionStatus(status)),
      this.obdAdapter.data$.subscribe(frame => this.handleNewFrame(frame)),
      this.diagnosticEngine.activeResults$.subscribe(results => this.handleDiagnosticResults(results)),
      this.sessionRecorder.isRecording$.subscribe(isRec => this.isRecording = isRec)
    );
  }

  private handleConnectionStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error') {
    this.status = status;
    if (status === 'connected') {
      this.diagnosticEngine.startSession();
    }
  }

  private handleNewFrame(frame: ObdLiveFrame) {
    this.latestFrame = frame;
    this.diagnosticEngine.processFrame(frame);
    
    if (this.isRecording) {
      this.sessionRecorder.recordFrame(frame);
    }
    
    this.updateCharts(frame);
  }

  private handleDiagnosticResults(results: DiagnosticResult[]) {
    this.diagnosticResults = results;
    if (this.isRecording) {
      this.sessionRecorder.recordDiagnosticResult(results);
    }
  }

  private updateCharts(frame: ObdLiveFrame) {
    const time = new Date(frame.timestamp).toLocaleTimeString();
    
    this.trimChartData.labels?.push(time);
    this.trimChartData.datasets[0].data.push(frame.stftB1);
    this.trimChartData.datasets[1].data.push(frame.ltftB1);
    
    this.rpmChartData.labels?.push(time);
    this.rpmChartData.datasets[0].data.push(frame.rpm);

    const maxPoints = 60;
    if (this.trimChartData.labels!.length > maxPoints) {
      this.trimChartData.labels?.shift();
      this.trimChartData.datasets[0].data.shift();
      this.trimChartData.datasets[1].data.shift();
      
      this.rpmChartData.labels?.shift();
      this.rpmChartData.datasets[0].data.shift();
    }
    
    // Efficiently update charts without creating new object references
    this.charts?.forEach(chart => chart.update());
  }

  connect() {
    this.obdAdapter.connect();
  }

  disconnect() {
    this.obdAdapter.disconnect();
    this.diagnosticEngine.stopSession();
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  onModeChange(mode: MockMode) {
    this.currentMode = mode;
    this.obdAdapter.setMockMode(mode);
  }

  startRecording() {
    if (this.vehicle) {
      this.sessionRecorder.startRecording(this.vehicle);
    }
  }

  stopRecording() {
    this.sessionRecorder.stopRecording();
  }
}
