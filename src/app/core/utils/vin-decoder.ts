export interface VinInfo {
  vin: string;
  manufacturer: string;
}

/**
 * Decodes a raw Mode 09 PID 02 response into a 17-character VIN.
 * @param rawResponse The raw ELM327 response (e.g. "49 02 01 57 41 55...")
 */
export function parseVinResponse(rawResponse: string): string | null {
  if (!rawResponse || rawResponse.includes('NO DATA') || rawResponse.includes('ERROR')) {
    return null;
  }

  // 1. Remove prompt and line breaks
  let cleaned = rawResponse.replace(/>/g, '').replace(/\r/g, '').replace(/\n/g, '').trim();

  // 2. Remove the "49 02" mode/pid echo.
  // Note: Depending on the ECU, there might be multiple lines starting with "49 02" or just one.
  // We'll strip out all "49 02" and also common multi-frame sequence numbers like "014902", "024902", but a simple regex works best.
  // The simplest way as per instructions: remove "49 02", remove spaces, convert hex to ASCII.
  cleaned = cleaned.replace(/49\s*02/g, '');
  
  // Also strip out typical multi-frame sequence bytes like '014', '024' etc if they are standalone?
  // The instruction says: "remove '49 02', remove spaces, convert hex pairs to ASCII, return 17-character VIN".
  // Let's just remove "49 02" and spaces.
  let hexString = cleaned.replace(/\s+/g, '');

  // Often multi-frame responses have sequence bytes: "01", "02", "03" etc. before the data if it wasn't stripped.
  // We'll convert all valid hex pairs to ASCII.
  let ascii = '';
  for (let i = 0; i < hexString.length; i += 2) {
    const pair = hexString.substring(i, i + 2);
    if (pair.length === 2) {
      const code = parseInt(pair, 16);
      // Only keep printable ASCII characters to filter out sequence bytes (which are usually 01, 02, etc.)
      if (code >= 32 && code <= 126) {
        ascii += String.fromCharCode(code);
      }
    }
  }

  // Find a contiguous block of exactly 17 alphanumeric characters, or just return the last 17 if it's longer
  // A standard VIN is 17 characters long (alphanumeric, except I, O, Q).
  const vinMatch = ascii.match(/[A-HJ-NPR-Z0-9]{17}/i);
  if (vinMatch) {
    return vinMatch[0].toUpperCase();
  }

  // Fallback: just return up to 17 valid chars if we couldn't match the strict regex
  const fallback = ascii.replace(/[^A-Z0-9]/gi, '');
  if (fallback.length >= 17) {
    return fallback.substring(fallback.length - 17).toUpperCase();
  }

  return null;
}

/**
 * Extracts a basic manufacturer name from a VIN using the WMI (World Manufacturer Identifier).
 */
export function extractManufacturer(vin: string): string {
  if (!vin || vin.length < 3) return 'Unknown';

  const wmi = vin.substring(0, 3).toUpperCase();
  
  // Basic WMI mapping
  if (wmi.startsWith('1G')) return 'General Motors';
  if (wmi.startsWith('1F')) return 'Ford';
  if (wmi.startsWith('1C')) return 'Chrysler';
  if (wmi.startsWith('2G')) return 'General Motors (Canada)';
  if (wmi.startsWith('2F')) return 'Ford (Canada)';
  if (wmi.startsWith('2C')) return 'Chrysler (Canada)';
  if (wmi.startsWith('3G')) return 'General Motors (Mexico)';
  if (wmi.startsWith('3F')) return 'Ford (Mexico)';
  if (wmi.startsWith('3C')) return 'Chrysler (Mexico)';
  if (wmi.startsWith('JTD')) return 'Toyota';
  if (wmi.startsWith('JTM')) return 'Toyota';
  if (wmi.startsWith('JTE')) return 'Toyota';
  if (wmi.startsWith('JHM')) return 'Honda';
  if (wmi.startsWith('JHL')) return 'Honda';
  if (wmi.startsWith('JH4')) return 'Honda';
  if (wmi.startsWith('JM1')) return 'Mazda';
  if (wmi.startsWith('WAU')) return 'Audi';
  if (wmi.startsWith('WBA')) return 'BMW';
  if (wmi.startsWith('WBS')) return 'BMW M';
  if (wmi.startsWith('WDB')) return 'Mercedes-Benz';
  if (wmi.startsWith('WDC')) return 'Mercedes-Benz';
  if (wmi.startsWith('WDD')) return 'Mercedes-Benz';
  if (wmi.startsWith('WP0')) return 'Porsche';
  if (wmi.startsWith('WVW')) return 'Volkswagen';
  if (wmi.startsWith('WVG')) return 'Volkswagen';
  if (wmi.startsWith('1N')) return 'Nissan';
  if (wmi.startsWith('JN')) return 'Nissan';
  if (wmi.startsWith('KND')) return 'Kia';
  if (wmi.startsWith('KM8')) return 'Hyundai';
  if (wmi.startsWith('KMH')) return 'Hyundai';

  // Fallback map for first two chars if three doesn't match perfectly
  const region = wmi.substring(0, 2);
  if (region === 'JT') return 'Toyota';
  if (region === 'JH') return 'Honda';
  if (region === 'JM') return 'Mazda';
  if (region === 'WA') return 'Audi';
  if (region === 'WB') return 'BMW';
  if (region === 'WD') return 'Mercedes-Benz';
  if (region === 'WV') return 'Volkswagen';
  if (region === 'WP') return 'Porsche';

  return 'Unknown';
}
