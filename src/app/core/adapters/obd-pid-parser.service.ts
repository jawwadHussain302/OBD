import { Injectable } from '@angular/core';

/** Strings that indicate the ELM327 could not obtain a valid response. */
const ERROR_TOKENS = ['NO DATA', 'STOPPED', 'ERROR', 'UNABLE TO CONNECT', 'NODATA'];

/**
 * Converts a clean ELM327 OBD Mode-01 response string into an engineering value.
 *
 * Parsing pipeline (per §10 of ble-elm327-plan.md):
 *   "41 0C 1A F8"
 *    → strip prompt/noise → normalise → split → drop echo bytes → parse hex → apply formula
 */
@Injectable({ providedIn: 'root' })
export class ObdPidParserService {

  /**
   * Parses a raw ELM327 response for the given PID command.
   *
   * @param pid     The command that was sent, e.g. "010C"
   * @param raw     The raw response received from the adapter
   * @returns       Engineering value, or null if the response is invalid/empty
   */
  parse(pid: string, raw: string): number | null {
    const bytes = this.extractBytes(raw);
    if (bytes === null) return null;

    switch (pid.toUpperCase()) {
      case '010C': return this.parseRpm(bytes);
      case '010D': return this.parseSpeed(bytes);
      case '0105': return this.parseCoolantTemp(bytes);
      case '0104': return this.parseEngineLoad(bytes);
      case '0106': return this.parseStft(bytes);
      case '0107': return this.parseLtft(bytes);
      default:     return null;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Strips the ELM327 prompt (`>`), whitespace, and linefeeds, then splits the
   * response into an array of decimal byte values.
   *
   * Handles both spaced ("41 0C 1A F8") and compact ("410C1AF8") formats.
   * Drops the two echo bytes (mode byte "41" + PID byte).
   * Returns null when an error token is present or the byte count is insufficient.
   */
  private extractBytes(raw: string): number[] | null {
    if (!raw) return null;

    const cleaned = raw
      .replace(/>/g, '')   // strip ELM327 prompt
      .replace(/\r/g, '')
      .replace(/\n/g, '')
      .trim()
      .toUpperCase();

    // Reject known error responses
    for (const token of ERROR_TOKENS) {
      if (cleaned.includes(token)) return null;
    }

    // Normalise to space-separated pairs: "410C1AF8" → "41 0C 1A F8"
    const spaced = cleaned.includes(' ')
      ? cleaned
      : cleaned.match(/.{1,2}/g)?.join(' ') ?? cleaned;

    const parts = spaced.split(/\s+/).filter(p => p.length > 0);

    // Need at least the two echo bytes plus one data byte
    if (parts.length < 3) return null;

    // Validate every part is a valid hex byte
    if (!parts.every(p => /^[0-9A-F]{2}$/.test(p))) return null;

    // Drop mode byte ("41") and PID echo byte — data starts at index 2
    const dataBytes = parts.slice(2).map(p => parseInt(p, 16));

    return dataBytes;
  }

  // ── PID formulas (SAE J1979 / ble-elm327-plan.md §8) ─────────────────────

  /** 010C — Engine RPM: ((A × 256) + B) / 4  →  rpm */
  private parseRpm(bytes: number[]): number | null {
    if (bytes.length < 2) return null;
    const [A, B] = bytes;
    return ((A * 256) + B) / 4;
  }

  /** 010D — Vehicle speed: A  →  km/h */
  private parseSpeed(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return bytes[0];
  }

  /** 0105 — Engine coolant temperature: A − 40  →  °C */
  private parseCoolantTemp(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return bytes[0] - 40;
  }

  /** 0104 — Calculated engine load: (A × 100) / 255  →  % */
  private parseEngineLoad(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return (bytes[0] * 100) / 255;
  }

  /** 0106 — Short-term fuel trim Bank 1: (A − 128) × 100 / 128  →  % */
  private parseStft(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return ((bytes[0] - 128) * 100) / 128;
  }

  /** 0107 — Long-term fuel trim Bank 1: (A − 128) × 100 / 128  →  % */
  private parseLtft(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return ((bytes[0] - 128) * 100) / 128;
  }
}
