import { Inject, Injectable, inject } from '@angular/core';
import { firstValueFrom, of, take, timeout, catchError } from 'rxjs';
import { ObdAdapter, OBD_ADAPTER } from '../adapters/obd-adapter.interface';
import { DtcCode } from './dtc/dtc-code.model';
import { DtcDecoderService } from './dtc/dtc-decoder.service';
import { DtcLookupService, DtcVehicleContext } from './dtc/dtc-lookup.service';
import { UnknownDtcLoggerService } from './dtc/unknown-dtc-logger.service';
import { VehicleProfileService } from '../vehicle/vehicle-profile.service';

// Maximum milliseconds to wait for a single Firebase DTC enrichment before
// giving up and keeping the 'unknown' placeholder. Set conservatively so the
// diagnosis flow is never blocked by a slow network or cold-start function.
const ENRICHMENT_TIMEOUT_MS = 8_000;

@Injectable({ providedIn: 'root' })
export class DiagnosisDtcCollectorService {
  private readonly vehicleProfiles = inject(VehicleProfileService);

  constructor(
    @Inject(OBD_ADAPTER) private readonly obdAdapter: ObdAdapter,
    private readonly dtcDecoder: DtcDecoderService,
    private readonly dtcLookup: DtcLookupService,
    private readonly unknownDtcLogger: UnknownDtcLoggerService,
  ) {}

  async collect(): Promise<DtcCode[]> {
    const rawCodes = await firstValueFrom(
      (this.obdAdapter.dtcCodes$ ?? of([] as readonly string[])).pipe(take(1))
    );

    let manufacturer: string | undefined;
    let vehicleContext: DtcVehicleContext | undefined;

    if (this.obdAdapter.vinInfo$) {
      const vinInfo = await firstValueFrom(this.obdAdapter.vinInfo$.pipe(take(1)));
      manufacturer = vinInfo?.manufacturer?.toLowerCase() ?? undefined;
      if (vinInfo?.manufacturer) {
        vehicleContext = { make: vinInfo.manufacturer };
      }
    }

    // Enrich vehicle context with the full saved profile (make, model, year,
    // engine, VIN) so the AI backend can generate accurate manufacturer-specific
    // definitions for unknown codes. Only defined values are included so
    // Object.keys() in the downstream check reflects actual content.
    const profile = this.vehicleProfiles.getActiveProfile();
    if (profile) {
      const ctx: DtcVehicleContext = {};
      const make = profile.make || vehicleContext?.make;
      if (make)               ctx.make   = make;
      if (profile.model)      ctx.model  = profile.model;
      if (profile.year)       ctx.year   = String(profile.year);
      if (profile.engineSize) ctx.engine = profile.engineSize;
      if (profile.vin)        ctx.vin    = profile.vin;
      vehicleContext = ctx;
      if (!manufacturer && profile.make) manufacturer = profile.make.toLowerCase();
    }

    // Step 1: fast synchronous local decode
    const dtcCodes = this.dtcDecoder.decodeMany([...rawCodes], manufacturer);

    // Step 2: collect indices of codes still unknown after local lookup
    const unknownIndices = dtcCodes
      .map((dtc, i) => ({ dtc, i }))
      .filter(({ dtc }) => dtc.source === 'unknown');

    // Step 3: log unknown codes to IndexedDB (fire-and-forget)
    unknownIndices.forEach(({ dtc }) => this.unknownDtcLogger.log(dtc.code));

    // Step 4: enrich unknown codes via Firebase (parallel, time-bounded)
    if (unknownIndices.length > 0) {
      const enriched = await Promise.allSettled(
        unknownIndices.map(({ dtc }) =>
          firstValueFrom(
            this.dtcLookup.lookup(dtc.code, manufacturer, vehicleContext).pipe(
              timeout(ENRICHMENT_TIMEOUT_MS),
              catchError(() => of(dtc)),
            ),
          ),
        ),
      );

      unknownIndices.forEach(({ i }, idx) => {
        const result = enriched[idx];
        if (result.status === 'fulfilled') {
          dtcCodes[i] = result.value;
        }
      });
    }

    return dtcCodes;
  }
}
