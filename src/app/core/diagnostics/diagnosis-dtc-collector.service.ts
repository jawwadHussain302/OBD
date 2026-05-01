import { Inject, Injectable } from '@angular/core';
import { firstValueFrom, of, take } from 'rxjs';
import { ObdAdapter, OBD_ADAPTER } from '../adapters/obd-adapter.interface';
import { DtcCode } from './dtc/dtc-code.model';
import { DtcDecoderService } from './dtc/dtc-decoder.service';
import { UnknownDtcLoggerService } from './dtc/unknown-dtc-logger.service';

@Injectable({ providedIn: 'root' })
export class DiagnosisDtcCollectorService {
  constructor(
    @Inject(OBD_ADAPTER) private readonly obdAdapter: ObdAdapter,
    private readonly dtcDecoder: DtcDecoderService,
    private readonly unknownDtcLogger: UnknownDtcLoggerService,
  ) {}

  async collect(): Promise<DtcCode[]> {
    const rawCodes = await firstValueFrom(
      (this.obdAdapter.dtcCodes$ ?? of([] as readonly string[])).pipe(take(1))
    );

    let manufacturer: string | undefined;
    if (this.obdAdapter.vinInfo$) {
      const vinInfo = await firstValueFrom(this.obdAdapter.vinInfo$.pipe(take(1)));
      manufacturer = vinInfo?.manufacturer?.toLowerCase() ?? undefined;
    }

    const dtcCodes = this.dtcDecoder.decodeMany([...rawCodes], manufacturer);
    dtcCodes
      .filter(dtc => dtc.source === 'unknown')
      .forEach(dtc => this.unknownDtcLogger.log(dtc.code));

    return dtcCodes;
  }
}
