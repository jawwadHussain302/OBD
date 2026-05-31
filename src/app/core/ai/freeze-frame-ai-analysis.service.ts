import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';
import type { VehicleProfile } from '../models/vehicle-profile.model';
import {
  FreezeFrameAiAnalysisState,
  FreezeFrameAiBackendResponse,
  FreezeFrameAiRequestPayload,
  FreezeFrameAiSample,
  FreezeFrameDiagnosisContext,
  FreezeFrameVehicleContext,
} from '../models/freeze-frame-ai.model';
import { AI_FREEZE_FRAME_ANALYSIS_FUNCTION_URL } from './ai-endpoint.config';

const IDLE_STATE: FreezeFrameAiAnalysisState = {
  status: 'idle',
  report: null,
  warningMessage: null,
  errorMessage: null,
  debug: {
    generatedPrompt: null,
    requestPayload: null,
    rawResponse: null,
    errorResponse: null,
  },
};

@Injectable({ providedIn: 'root' })
export class FreezeFrameAiAnalysisService {
  private stateSubject = new BehaviorSubject<FreezeFrameAiAnalysisState>(IDLE_STATE);
  readonly state$: Observable<FreezeFrameAiAnalysisState> = this.stateSubject.asObservable();

  reset(): void {
    this.stateSubject.next(IDLE_STATE);
  }

  async analyse(
    diagnosisState: DeepDiagnosisState,
    profile: VehicleProfile | null,
    samples: FreezeFrameAiSample[],
  ): Promise<void> {
    const vehicleContext = this.buildVehicleContext(profile);
    const diagnosisSummary = this.buildDiagnosisContext(diagnosisState);
    const warningMessage = profile
      ? null
      : 'No vehicle selected. The prompt marks vehicle fields as unknown.';
    const prompt = this.buildPrompt(vehicleContext, diagnosisSummary, samples);
    const requestPayload: FreezeFrameAiRequestPayload = {
      source: 'obd-dashboard-freeze-frame',
      generatedAt: new Date().toISOString(),
      vehicleContext,
      diagnosisSummary,
      samples,
      prompt,
    };

    if (!samples.length) {
      this.stateSubject.next({
        status: 'error',
        report: null,
        warningMessage,
        errorMessage: 'No freeze-frame data available yet. Run live data or diagnosis first.',
        debug: {
          generatedPrompt: prompt,
          requestPayload,
          rawResponse: null,
          errorResponse: 'No samples were available to send.',
        },
      });
      return;
    }

    this.stateSubject.next({
      status: 'loading',
      report: null,
      warningMessage,
      errorMessage: null,
      debug: {
        generatedPrompt: prompt,
        requestPayload,
        rawResponse: null,
        errorResponse: null,
      },
    });

    try {
      const res = await fetch(AI_FREEZE_FRAME_ANALYSIS_FUNCTION_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const data = await res.json().catch(() => ({})) as FreezeFrameAiBackendResponse;
      const rawResponse = data.rawResponse ?? data.reportMarkdown ?? null;

      if (!res.ok || data.error) {
        const message = data.error ?? `Service error ${res.status}`;
        this.stateSubject.next({
          status: 'error',
          report: null,
          warningMessage,
          errorMessage: 'Unable to analyze freeze-frame data. Please try again.',
          debug: {
            generatedPrompt: prompt,
            requestPayload,
            rawResponse,
            errorResponse: message,
          },
        });
        return;
      }

      this.stateSubject.next({
        status: 'ready',
        report: data.reportMarkdown?.trim() || rawResponse || 'AI returned an empty response.',
        warningMessage: data.warning ?? warningMessage,
        errorMessage: null,
        debug: {
          generatedPrompt: prompt,
          requestPayload,
          rawResponse,
          errorResponse: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI backend unavailable';
      this.stateSubject.next({
        status: 'error',
        report: null,
        warningMessage,
        errorMessage: 'Unable to analyze freeze-frame data. Please try again.',
        debug: {
          generatedPrompt: prompt,
          requestPayload,
          rawResponse: null,
          errorResponse: message,
        },
      });
    }
  }

  private buildVehicleContext(profile: VehicleProfile | null): FreezeFrameVehicleContext {
    return {
      make: profile?.make || null,
      model: profile?.model || null,
      year: profile?.year ?? null,
      variant: profile?.trimVariant || null,
      trim: profile?.trimVariant || null,
      engine: profile?.engineSize || null,
      fuelType: profile?.fuelType || null,
      transmission: profile?.transmission || null,
      obdProtocol: profile?.detectedProtocol || null,
      safeVinIdentifier: this.safeVinIdentifier(profile),
      mileage: null,
    };
  }

  private safeVinIdentifier(profile: VehicleProfile | null): string | null {
    if (profile?.vinPattern) return profile.vinPattern;
    if (!profile?.vin) return null;
    return `${profile.vin.slice(0, 3)}***********${profile.vin.slice(-3)}`;
  }

  private buildDiagnosisContext(state: DeepDiagnosisState): FreezeFrameDiagnosisContext {
    return {
      status: state.status,
      summaryText: state.diagnosisSummary?.summaryText ?? null,
      recommendedAction: state.diagnosisSummary?.recommendedAction ?? null,
      severity: state.severity ?? null,
      dtcs: (state.dtcCodes ?? []).map(dtc => dtc.code),
      findings: [...(state.findings ?? []), ...(state.dtcFindings ?? [])].slice(0, 12),
      rootCauses: (state.rootCauses ?? []).slice(0, 5),
      isPartial: state.isPartial ?? false,
    };
  }

  private buildPrompt(
    vehicle: FreezeFrameVehicleContext,
    diagnosis: FreezeFrameDiagnosisContext,
    samples: FreezeFrameAiSample[],
  ): string {
    const vehicleLabel = [
      vehicle.year ?? 'unknown year',
      vehicle.make ?? 'unknown make',
      vehicle.model ?? 'unknown model',
      vehicle.variant ?? vehicle.engine ?? null,
      vehicle.fuelType ?? null,
    ].filter(Boolean).join(' ');

    return [
      'You are an expert automotive diagnostic mechanic.',
      '',
      `Given below are ${samples.length} different freeze-frame/live-data samples from ${vehicleLabel}. Analyze the data carefully and identify what looks abnormal, what may be causing the issue, and what the mechanic should test next.`,
      '',
      'Do not rely on one reading only. Compare all samples and look for patterns across RPM, load, fuel trims, MAF, MAP, throttle, coolant temperature, O2 sensor behavior, DTCs, and readiness context.',
      '',
      'Return a structured mechanic report with these sections:',
      '1. Overall assessment',
      '2. Abnormal readings',
      '3. Likely causes ranked by probability',
      '4. Evidence from each frame/sample',
      '5. Recommended next checks',
      '6. Repair guidance',
      '7. What not to replace yet',
      '8. Safety/driveability notes',
      '9. Confidence',
      '',
      'Rules:',
      '- Do not fabricate missing sensor values.',
      '- Mark unavailable fields as unknown or not available.',
      '- Do not recommend replacing parts without a confirming test.',
      '- Do not include personal user data.',
      '',
      'Vehicle:',
      JSON.stringify(vehicle, null, 2),
      '',
      'Diagnosis summary:',
      JSON.stringify(diagnosis, null, 2),
      '',
      'Freeze-frame samples:',
      JSON.stringify(samples, null, 2),
    ].join('\n');
  }
}
