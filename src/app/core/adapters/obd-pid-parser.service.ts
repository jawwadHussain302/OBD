import { Injectable } from '@angular/core';
import { SignalValidator } from '../utils/signal-validator';

/** Strings that indicate the ELM327 could not obtain a valid response. */
const ERROR_TOKENS = ['NO DATA', 'STOPPED', 'ERROR', 'UNABLE TO CONNECT', 'NODATA'];

/**
 * Converts a clean ELM327 OBD Mode-01 response string into an engineering value.
 */
@Injectable({ providedIn: 'root' })
export class ObdPidParserService {

  /**
   * Parses a raw ELM327 response for the given PID command.
   *
   * @param pid The command that was sent, e.g. "010C"
   * @param raw The raw response received from the adapter
   * @returns Engineering value, or null if the response is invalid/empty
   */
  parse(pid: string, raw: string): number | null {
    const bytes = this.extractBytes(pid, raw);
    if (bytes === null) return null;

    switch (pid.toUpperCase()) {
      case '010C': return this.parseRpm(bytes);
      case '010D': return this.parseSpeed(bytes);
      case '0105': return this.parseCoolantTemp(bytes);
      case '0104': return this.parseEngineLoad(bytes);
      case '0106': return this.parseStft(bytes);
      case '0107': return this.parseLtft(bytes);
      case '010F': return this.parseIntakeAirTemp(bytes);
      case '0110': return this.parseMaf(bytes);
      case '0111': return this.parseThrottlePosition(bytes);
      default:     return null;
    }
  }

  /**
   * Finds a Mode-01 response line matching the requested PID.
   * Handles spaced/compact payloads, trailing prompts, echoed commands, and
   * multi-line ELM327 output. Mismatched PIDs are rejected instead of parsed.
   */
  private extractBytes(pid: string, raw: string): number[] | null {
    if (!raw) return null;

    const cleaned = raw
      .replace(/>/g, '')
      .replace(/\r\n|\r/g, '\n')
      .trim()
      .toUpperCase();

    for (const token of ERROR_TOKENS) {
      if (cleaned.includes(token)) return null;
    }

    const command = pid.toUpperCase();
    const expectedPid = parseInt(command.slice(2, 4), 16);

    for (const line of cleaned.split('\n')) {
      let compact = line.replace(/\s+/g, '');
      if (!compact) continue;

      if (compact === command) continue;
      if (compact.startsWith(command)) {
        compact = compact.slice(command.length);
      }

      if (compact.length < 6 || compact.length % 2 !== 0) continue;
      if (!/^[0-9A-F]+$/.test(compact)) continue;

      const parts = compact.match(/.{2}/g);
      if (!parts || parts.length < 3) continue;

      const bytes = parts.map(p => parseInt(p, 16));
      if (bytes[0] !== 0x41 || bytes[1] !== expectedPid) continue;

      return bytes.slice(2);
    }

    return null;
  }

  /** 010C - Engine RPM: ((A * 256) + B) / 4 rpm */
  private parseRpm(bytes: number[]): number | null {
    if (bytes.length < 2) return null;
    const [A, B] = bytes;
    return SignalValidator.validateRpm(((A * 256) + B) / 4);
  }

  /** 010D - Vehicle speed: A km/h */
  private parseSpeed(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return SignalValidator.clamp(bytes[0], 0, 300);
  }

  /** 0105 - Engine coolant temperature: A - 40 C */
  private parseCoolantTemp(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return SignalValidator.validateTemp(bytes[0] - 40);
  }

  /** 0104 - Calculated engine load: (A * 100) / 255 % */
  private parseEngineLoad(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return SignalValidator.validatePercent((bytes[0] * 100) / 255);
  }

  /** 0106 - Short-term fuel trim Bank 1: (A - 128) * 100 / 128 % */
  private parseStft(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return SignalValidator.validateFuelTrim(((bytes[0] - 128) * 100) / 128);
  }

  /** 0107 - Long-term fuel trim Bank 1: (A - 128) * 100 / 128 % */
  private parseLtft(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return SignalValidator.validateFuelTrim(((bytes[0] - 128) * 100) / 128);
  }

  /** 0111 - Absolute throttle position: (A * 100) / 255 % */
  private parseThrottlePosition(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return SignalValidator.validatePercent((bytes[0] * 100) / 255);
  }

  /** 010F - Intake air temperature: A - 40 C */
  private parseIntakeAirTemp(bytes: number[]): number | null {
    if (bytes.length < 1) return null;
    return SignalValidator.validateTemp(bytes[0] - 40);
  }

  /** 0110 - Mass Air Flow: ((A * 256) + B) / 100 g/s */
  private parseMaf(bytes: number[]): number | null {
    if (bytes.length < 2) return null;
    const [A, B] = bytes;
    return SignalValidator.clamp(((A * 256) + B) / 100, 0, 655);
  }
}
