import { Injectable, inject } from '@angular/core';
import { Observable, from, firstValueFrom, of, catchError, map } from 'rxjs';
import { DtcCode } from './dtc-code.model';
import { DtcDecoderService } from './dtc-decoder.service';
import { DTC_LOOKUP_FUNCTION_URL } from '../../ai/ai-endpoint.config';

// ── Public types ──────────────────────────────────────────────────────────────

export interface DtcVehicleContext {
  make?: string;
  model?: string;
  year?: string;
  engine?: string;
  vin?: string;
}

// Shape returned by the lookupDtc Firebase function
interface DtcLookupResponse {
  code: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  commonCauses: string[];
  recommendedChecks: string[];
  safeToDrive: boolean;
  confidence: 'low' | 'medium' | 'high';
  source: 'firebase' | 'ai_generated';
  reviewStatus: 'verified' | 'pending_review';
  error?: string;
}

// ── Fallback returned when all lookups fail ───────────────────────────────────

function unknownFallback(code: string): DtcCode {
  return {
    code,
    title: 'Unknown DTC — AI lookup unavailable',
    description: 'This code is not in the local database and the AI lookup service could not be reached.',
    source: 'unknown',
    severity: 'Unknown',
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DtcLookupService {
  private readonly localDecoder = inject(DtcDecoderService);

  /** Session-scoped in-memory cache: code → enriched DtcCode. */
  private readonly cache = new Map<string, DtcCode>();

  /**
   * Look up a DTC code using the full priority chain:
   *   1. Local bundled maps (generic + manufacturer) — synchronous, instant.
   *   2. Firestore / AI via the lookupDtc Firebase function — async.
   *
   * Always emits exactly one value and completes; errors produce the
   * "Unknown DTC — AI lookup unavailable" fallback so callers never throw.
   *
   * Results from the Firebase path are cached in memory for the session;
   * Firestore is the shared persistent cache across all users.
   */
  lookup(
    code: string,
    manufacturer?: string,
    vehicleContext?: DtcVehicleContext,
  ): Observable<DtcCode> {
    const normalized = code.trim().toUpperCase();

    // 1. Local decode — instant, no network
    const local = this.localDecoder.decode(normalized, manufacturer);
    if (local.source !== 'unknown') {
      return of(local);
    }

    // 2. Session cache — avoids repeat network calls within a session
    const cached = this.cache.get(normalized);
    if (cached) {
      return of(cached);
    }

    // 3. Firebase (Firestore → AI)
    return from(this.fetchFromFunction(normalized, vehicleContext)).pipe(
      map(result => {
        this.cache.set(normalized, result);
        return result;
      }),
      catchError(() => {
        // Cache the fallback so repeated calls for the same unknown code skip
        // the network and fail fast for the rest of the session.
        const fallback = unknownFallback(normalized);
        this.cache.set(normalized, fallback);
        return of(fallback);
      }),
    );
  }

  /**
   * Batch lookup: runs all codes in parallel and returns results in the same
   * order. One failure never blocks the others.
   */
  async lookupMany(
    codes: string[],
    manufacturer?: string,
    vehicleContext?: DtcVehicleContext,
  ): Promise<DtcCode[]> {
    const results = await Promise.allSettled(
      codes.map(c => firstValueFrom(this.lookup(c, manufacturer, vehicleContext))),
    );
    return results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : unknownFallback(codes[i].trim().toUpperCase()),
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async fetchFromFunction(
    code: string,
    vehicleContext?: DtcVehicleContext,
  ): Promise<DtcCode> {
    const body: Record<string, unknown> = { code };
    if (vehicleContext && Object.keys(vehicleContext).length > 0) {
      body['vehicleContext'] = vehicleContext;
    }

    const res = await fetch(DTC_LOOKUP_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as DtcLookupResponse;

    if (data.error || !data.title) {
      return unknownFallback(code);
    }

    return this.mapResponse(code, data);
  }

  private mapResponse(code: string, r: DtcLookupResponse): DtcCode {
    return {
      code,
      title: r.title,
      description: r.description,
      severity: this.mapSeverity(r.severity),
      possibleCauses: r.commonCauses,
      recommendedChecks: r.recommendedChecks,
      source: r.source,
      safeToDrive: r.safeToDrive,
      lookupConfidence: r.confidence,
      reviewStatus: r.reviewStatus,
    };
  }

  private mapSeverity(s: string): 'Low' | 'Medium' | 'High' | 'Critical' | 'Unknown' {
    if (s === 'low')    return 'Low';
    if (s === 'medium') return 'Medium';
    if (s === 'high')   return 'High';
    return 'Unknown';
  }
}
