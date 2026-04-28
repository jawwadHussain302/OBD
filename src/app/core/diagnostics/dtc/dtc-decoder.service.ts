import { Injectable } from '@angular/core';
import { DtcCode } from './dtc-code.model';
import { GENERIC_DTC_MAP } from './generic-dtc-map';
import { TOYOTA_DTC_MAP } from './toyota-dtc-map';

type ManufacturerKey = 'toyota';

const MANUFACTURER_MAPS: Record<ManufacturerKey, Record<string, Omit<DtcCode, 'code' | 'source'>>> = {
  toyota: TOYOTA_DTC_MAP,
};

const UNKNOWN_CODE: Omit<DtcCode, 'code'> = {
  title: 'Unknown Code',
  description: 'Unknown diagnostic trouble code',
  category: 'Unknown',
  severity: 'Unknown',
  source: 'unknown',
};

@Injectable({ providedIn: 'root' })
export class DtcDecoderService {
  decode(code: string, manufacturer?: string): DtcCode {
    const normalized = code.trim().toUpperCase();

    if (manufacturer) {
      const mfrKey = manufacturer.toLowerCase() as ManufacturerKey;
      const mfrMap = MANUFACTURER_MAPS[mfrKey];
      if (mfrMap?.[normalized]) {
        const entry = mfrMap[normalized];
        return { code: normalized, source: 'manufacturer', ...entry };
      }
    }

    if (GENERIC_DTC_MAP[normalized]) {
      const entry = GENERIC_DTC_MAP[normalized];
      return { code: normalized, source: 'generic', ...entry };
    }

    return { code: normalized, ...UNKNOWN_CODE };
  }

  decodeMany(codes: string[], manufacturer?: string): DtcCode[] {
    return codes.map(code => this.decode(code, manufacturer));
  }
}
