import { TestBed } from '@angular/core/testing';
import { ObdPidParserService } from './obd-pid-parser.service';

describe('ObdPidParserService', () => {
  let service: ObdPidParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ObdPidParserService);
  });

  // ── 010C RPM ───────────────────────────────────────────────────────────────

  describe('010C — RPM', () => {
    it('parses spaced response', () => {
      // 0x1A = 26, 0xF8 = 248  →  ((26 × 256) + 248) / 4 = 1726
      expect(service.parse('010C', '41 0C 1A F8')).toBe(1726);
    });

    it('parses compact response without spaces', () => {
      expect(service.parse('010C', '410C1AF8')).toBe(1726);
    });

    it('parses response containing ELM327 prompt', () => {
      expect(service.parse('010C', '41 0C 1A F8\r\n>')).toBe(1726);
    });

    it('returns idle RPM correctly — 0x0C 0x80 = 800 rpm', () => {
      // ((12 × 256) + 128) / 4 = 800
      expect(service.parse('010C', '41 0C 0C 80')).toBe(800);
    });
  });

  // ── 010D Speed ────────────────────────────────────────────────────────────

  describe('010D — Speed', () => {
    it('parses 80 km/h', () => {
      // 0x50 = 80
      expect(service.parse('010D', '41 0D 50')).toBe(80);
    });

    it('parses zero speed', () => {
      expect(service.parse('010D', '41 0D 00')).toBe(0);
    });
  });

  // ── 0105 Coolant Temp ─────────────────────────────────────────────────────

  describe('0105 — Coolant temperature', () => {
    it('parses 90 °C operating temperature', () => {
      // 0x82 = 130  →  130 − 40 = 90
      expect(service.parse('0105', '41 05 82')).toBe(90);
    });

    it('parses sub-zero cold start temperature', () => {
      // 0x00 = 0  →  0 − 40 = −40
      expect(service.parse('0105', '41 05 00')).toBe(-40);
    });
  });

  // ── 0104 Engine Load ──────────────────────────────────────────────────────

  describe('0104 — Engine load', () => {
    it('parses 50% load', () => {
      // 0x80 = 128  →  (128 × 100) / 255 ≈ 50.2
      expect(service.parse('0104', '41 04 80')).toBeCloseTo(50.2, 0);
    });

    it('parses 100% load', () => {
      // 0xFF = 255  →  (255 × 100) / 255 = 100
      expect(service.parse('0104', '41 04 FF')).toBe(100);
    });
  });

  // ── 0106 STFT B1 ──────────────────────────────────────────────────────────

  describe('0106 — Short-term fuel trim Bank 1', () => {
    it('parses 0% trim (stoichiometric)', () => {
      // 0x80 = 128  →  (128 − 128) × 100 / 128 = 0
      expect(service.parse('0106', '41 06 80')).toBe(0);
    });

    it('parses positive lean correction', () => {
      // 0x90 = 144  →  (144 − 128) × 100 / 128 = 12.5%
      expect(service.parse('0106', '41 06 90')).toBeCloseTo(12.5, 1);
    });

    it('parses negative rich correction', () => {
      // 0x70 = 112  →  (112 − 128) × 100 / 128 = −12.5%
      expect(service.parse('0106', '41 06 70')).toBeCloseTo(-12.5, 1);
    });
  });

  // ── 0107 LTFT B1 ──────────────────────────────────────────────────────────

  describe('0107 — Long-term fuel trim Bank 1', () => {
    it('parses 0% trim', () => {
      expect(service.parse('0107', '41 07 80')).toBe(0);
    });

    it('uses same formula as STFT', () => {
      expect(service.parse('0107', '41 07 90')).toBeCloseTo(12.5, 1);
    });
  });

  // ── 0111 Throttle Position ────────────────────────────────────────────────
  describe('0111 — Throttle position', () => {
    it('parses 50.2% throttle spaced', () => {
      // 0x80 = 128  →  (128 × 100) / 255 ≈ 50.196
      expect(service.parse('0111', '41 11 80')).toBeCloseTo(50.2, 1);
    });

    it('parses compact response without spaces', () => {
      expect(service.parse('0111', '411180')).toBeCloseTo(50.2, 1);
    });

    it('returns null for NO DATA', () => {
      expect(service.parse('0111', 'NO DATA')).toBeNull();
    });
  });

  // ── 010F Intake Air Temp ──────────────────────────────────────────────────
  describe('010F — Intake Air Temp', () => {
    it('parses 40 °C spaced', () => {
      // 0x50 = 80  →  80 − 40 = 40
      expect(service.parse('010F', '41 0F 50')).toBe(40);
    });

    it('parses 40 °C with trailing prompt', () => {
      expect(service.parse('010F', '410F50>')).toBe(40);
    });

    it('returns null when malformed', () => {
      expect(service.parse('010F', '41 0F ZZ')).toBeNull();
    });
  });

  // ── 0110 MAF ──────────────────────────────────────────────────────────────
  describe('0110 — MAF', () => {
    it('parses 5.00 g/s spaced', () => {
      // 0x01 = 1, 0xF4 = 244  →  ((1 × 256) + 244) / 100 = 5.00
      expect(service.parse('0110', '41 10 01 F4')).toBeCloseTo(5.00, 2);
    });

    it('returns null when incomplete bytes', () => {
      expect(service.parse('0110', '41 10 01')).toBeNull();
    });
  });

  // ── Error / edge cases ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns null for NO DATA', () => {
      expect(service.parse('010C', 'NO DATA')).toBeNull();
    });

    it('returns null for NO DATA with prompt', () => {
      expect(service.parse('010C', 'NO DATA\r\n>')).toBeNull();
    });

    it('returns null for STOPPED', () => {
      expect(service.parse('010C', 'STOPPED')).toBeNull();
    });

    it('returns null for ERROR', () => {
      expect(service.parse('010C', 'ERROR')).toBeNull();
    });

    it('returns null for UNABLE TO CONNECT', () => {
      expect(service.parse('010C', 'UNABLE TO CONNECT')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(service.parse('010C', '')).toBeNull();
    });

    it('returns null when too few data bytes', () => {
      // RPM needs 2 data bytes; only 1 provided
      expect(service.parse('010C', '41 0C 1A')).toBeNull();
    });

    it('returns null for unknown PID', () => {
      expect(service.parse('0100', '41 00 BE 3E B8 11')).toBeNull();
    });

    it('returns null for malformed hex', () => {
      expect(service.parse('010D', '41 0D ZZ')).toBeNull();
    });

    it('is case-insensitive for PID lookup', () => {
      expect(service.parse('010c', '41 0C 1A F8')).toBe(1726);
    });

    it('handles lowercase hex response', () => {
      expect(service.parse('010C', '41 0c 1a f8')).toBe(1726);
    });
  });
});
