export interface ConnectionProfile {
  protocol: string;
  baudRate: string;
  description: string;
  isSupported: boolean;
  recommendation: string;
}

export function deriveConnectionProfile(year: number, make: string): ConnectionProfile {
  if (year >= 2008) {
    return {
      protocol: 'ISO 15765-4 (CAN Bus)',
      baudRate: '500 kbps / 250 kbps',
      description: `${year} ${make} uses the modern CAN Bus protocol.`,
      isSupported: true,
      recommendation: 'ELM327 v1.5+ recommended for full CAN support.',
    };
  } else if (year >= 1996) {
    return {
      protocol: 'OBD-II (Auto-Detect)',
      baudRate: '10.4 kbps',
      description: `${year} ${make} supports OBD-II. Protocol will be auto-detected on connection.`,
      isSupported: true,
      recommendation: 'Any ELM327 adapter will work. Allow up to 30 s for protocol detection.',
    };
  } else {
    return {
      protocol: 'Pre-OBD-II / OBD-I',
      baudRate: 'N/A',
      description: `${year} ${make} predates mandatory OBD-II (1996). Standard ELM327 adapters have limited support.`,
      isSupported: false,
      recommendation: 'A manufacturer-specific adapter may be required.',
    };
  }
}
