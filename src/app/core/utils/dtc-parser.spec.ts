import { decodeDtcPair, parseDtcResponse } from './dtc-parser';

// ── decodeDtcPair ──────────────────────────────────────────────────────────

describe('decodeDtcPair', () => {

  // ── null terminator ──────────────────────────────────────────────────────

  it('returns null for 0x00 0x00 (list terminator)', () => {
    expect(decodeDtcPair(0x00, 0x00)).toBeNull();
  });

  // ── Powertrain (P) — bits 15–14 = 00 ────────────────────────────────────

  it('decodes P0133 — O2 sensor slow response', () => {
    // 0x0133: bits 15-14 = 00 → P, digits = 0133
    expect(decodeDtcPair(0x01, 0x33)).toBe('P0133');
  });

  it('decodes P0420 — catalyst efficiency below threshold', () => {
    // 0x0420: bits 15-14 = 00 → P, digits = 0420
    expect(decodeDtcPair(0x04, 0x20)).toBe('P0420');
  });

  it('decodes P0001 — just above null terminator', () => {
    expect(decodeDtcPair(0x00, 0x01)).toBe('P0001');
  });

  it('decodes P3FFF — highest P code', () => {
    // 0x3FFF: bits 15-14 = 00, digits = 3FFF
    expect(decodeDtcPair(0x3F, 0xFF)).toBe('P3FFF');
  });

  // ── Chassis (C) — bits 15–14 = 01 ───────────────────────────────────────

  it('decodes C0200 — power steering pressure sensor', () => {
    // 0x4200: bits 15-14 = 01 → C, digits = 0200
    expect(decodeDtcPair(0x42, 0x00)).toBe('C0200');
  });

  it('decodes C0101', () => {
    // 0x4101: bits 15-14 = 01 → C, digits = 0101
    expect(decodeDtcPair(0x41, 0x01)).toBe('C0101');
  });

  // ── Body (B) — bits 15–14 = 10 ──────────────────────────────────────────

  it('decodes B1234', () => {
    // 0x9234: bits 15-14 = 10 → B, digits = 1234
    expect(decodeDtcPair(0x92, 0x34)).toBe('B1234');
  });

  it('decodes B0001', () => {
    // 0x8001: bits 15-14 = 10 → B, digits = 0001
    expect(decodeDtcPair(0x80, 0x01)).toBe('B0001');
  });

  // ── Network (U) — bits 15–14 = 11 ───────────────────────────────────────

  it('decodes U0101 — lost communication with ECM/PCM', () => {
    // 0xC101: bits 15-14 = 11 → U, digits = 0101
    expect(decodeDtcPair(0xC1, 0x01)).toBe('U0101');
  });

  it('decodes U3FFF — highest U code', () => {
    // 0xFFFF: bits 15-14 = 11 → U, digits = 3FFF
    expect(decodeDtcPair(0xFF, 0xFF)).toBe('U3FFF');
  });

  // ── Digit formatting ─────────────────────────────────────────────────────

  it('zero-pads single-digit values to 4 characters', () => {
    // 0x0001: P0001
    expect(decodeDtcPair(0x00, 0x01)).toBe('P0001');
  });

  it('produces uppercase hex digits', () => {
    // 0x0ABC: digits = 0ABC (not 0abc)
    expect(decodeDtcPair(0x0A, 0xBC)).toBe('P0ABC');
  });

});

// ── parseDtcResponse ───────────────────────────────────────────────────────

describe('parseDtcResponse', () => {

  // ── Empty / falsy input ───────────────────────────────────────────────────

  it('returns [] for empty string', () => {
    expect(parseDtcResponse('')).toEqual([]);
  });

  it('returns [] for whitespace only', () => {
    expect(parseDtcResponse('   ')).toEqual([]);
  });

  // ── ELM327 error tokens ───────────────────────────────────────────────────

  it('returns [] for NO DATA', () => {
    expect(parseDtcResponse('NO DATA')).toEqual([]);
  });

  it('returns [] for NODATA (compact variant)', () => {
    expect(parseDtcResponse('NODATA')).toEqual([]);
  });

  it('returns [] for STOPPED', () => {
    expect(parseDtcResponse('STOPPED')).toEqual([]);
  });

  it('returns [] for ERROR', () => {
    expect(parseDtcResponse('ERROR')).toEqual([]);
  });

  it('returns [] for UNABLE TO CONNECT', () => {
    expect(parseDtcResponse('UNABLE TO CONNECT')).toEqual([]);
  });

  it('returns [] for CAN ERROR', () => {
    expect(parseDtcResponse('CAN ERROR')).toEqual([]);
  });

  it('treats error tokens case-insensitively', () => {
    expect(parseDtcResponse('no data')).toEqual([]);
    expect(parseDtcResponse('No Data')).toEqual([]);
  });

  // ── No stored codes ───────────────────────────────────────────────────────

  it('returns [] when DTC count is 0 ("43 00")', () => {
    expect(parseDtcResponse('43 00')).toEqual([]);
  });

  it('returns [] when count is 0 with trailing prompt ("43 00\\r>")', () => {
    expect(parseDtcResponse('43 00\r>')).toEqual([]);
  });

  it('returns [] when count byte is 0 despite trailing padding zeros', () => {
    // Some adapters pad the response with 00 bytes
    expect(parseDtcResponse('43 00 00 00 00 00')).toEqual([]);
  });

  // ── Single stored DTC (Mode 03 — response 0x43) ──────────────────────────

  it('parses a single stored DTC in spaced format', () => {
    expect(parseDtcResponse('43 01 01 33')).toEqual(['P0133']);
  });

  it('parses a single stored DTC in compact format', () => {
    expect(parseDtcResponse('43010133')).toEqual(['P0133']);
  });

  it('ignores trailing ">" prompt', () => {
    expect(parseDtcResponse('43 01 01 33\r>')).toEqual(['P0133']);
  });

  it('handles lowercase hex input', () => {
    expect(parseDtcResponse('43 01 01 33')).toEqual(['P0133']);
    expect(parseDtcResponse('43 01 01 33'.toLowerCase())).toEqual(['P0133']);
  });

  // ── Multiple DTCs ─────────────────────────────────────────────────────────

  it('parses two stored DTCs', () => {
    expect(parseDtcResponse('43 02 01 33 04 20')).toEqual(['P0133', 'P0420']);
  });

  it('parses three DTCs of different system types', () => {
    // P0133, C0200, B1234
    expect(parseDtcResponse('43 03 01 33 42 00 92 34')).toEqual([
      'P0133', 'C0200', 'B1234',
    ]);
  });

  // ── 0x00 0x00 sentinel terminator ────────────────────────────────────────

  it('stops at 00 00 sentinel even when count indicates more codes', () => {
    // count = 3, but list terminates at 00 00 after 2 real DTCs
    expect(parseDtcResponse('43 03 01 33 04 20 00 00')).toEqual(['P0133', 'P0420']);
  });

  it('returns [] when only pair is 00 00', () => {
    // count = 1, pair is null terminator
    expect(parseDtcResponse('43 01 00 00')).toEqual([]);
  });

  // ── DTC count as cap ──────────────────────────────────────────────────────

  it('does not decode more DTCs than the reported count', () => {
    // count = 1 even though two pairs follow
    expect(parseDtcResponse('43 01 01 33 04 20')).toEqual(['P0133']);
  });

  // ── Pending DTC (Mode 07 — response 0x47) ────────────────────────────────

  it('parses a pending DTC from Mode 07 response', () => {
    expect(parseDtcResponse('47 01 01 33')).toEqual(['P0133']);
  });

  it('parses two pending DTCs from Mode 07 response', () => {
    expect(parseDtcResponse('47 02 01 33 04 20')).toEqual(['P0133', 'P0420']);
  });

  // ── All four system types ─────────────────────────────────────────────────

  it('decodes all four DTC system types in a single response', () => {
    // P0133, C0200, B1234, U0101
    expect(parseDtcResponse('43 04 01 33 42 00 92 34 C1 01')).toEqual([
      'P0133', 'C0200', 'B1234', 'U0101',
    ]);
  });

  // ── Multi-line with line-number prefixes ──────────────────────────────────

  it('strips "0:" / "1:" line-number prefixes from multi-frame responses', () => {
    const raw = '0: 43 02\r\n1: 01 33 04 20';
    expect(parseDtcResponse(raw)).toEqual(['P0133', 'P0420']);
  });

  it('handles multi-line with Unix newlines', () => {
    const raw = '0: 43 02\n1: 01 33 04 20';
    expect(parseDtcResponse(raw)).toEqual(['P0133', 'P0420']);
  });

  it('handles multi-line without line-number prefixes', () => {
    const raw = '43 02\r\n01 33 04 20';
    expect(parseDtcResponse(raw)).toEqual(['P0133', 'P0420']);
  });

  // ── Echo robustness ───────────────────────────────────────────────────────

  it('skips echoed command bytes before the mode response byte', () => {
    // If ATE0 did not take effect, the command "03" is echoed back before "43..."
    expect(parseDtcResponse('03\r43 01 01 33')).toEqual(['P0133']);
  });

  it('skips echoed "07" before Mode 07 response', () => {
    expect(parseDtcResponse('07\r47 01 04 20')).toEqual(['P0420']);
  });

  // ── Malformed / unrecognised input ────────────────────────────────────────

  it('returns [] when no mode response byte is found', () => {
    expect(parseDtcResponse('01 33 04 20')).toEqual([]);
  });

  it('returns [] for an unrecognised mode byte', () => {
    // 0x44 is not a valid DTC mode response
    expect(parseDtcResponse('44 01 01 33')).toEqual([]);
  });

  it('returns [] when only the mode byte is present with no count byte', () => {
    expect(parseDtcResponse('43')).toEqual([]);
  });

  it('returns [] for random non-hex content', () => {
    expect(parseDtcResponse('hello world')).toEqual([]);
  });

  it('returns [] for ">" alone', () => {
    expect(parseDtcResponse('>')).toEqual([]);
  });

});
