/**
 * ELM327 error tokens that indicate no DTC data is available.
 * Matched case-insensitively against the raw response.
 */
const DTC_ERROR_TOKENS = [
  'NO DATA', 'STOPPED', 'ERROR', 'UNABLE TO CONNECT', 'NODATA', 'CAN ERROR',
];

/**
 * Maps the two high bits of the 16-bit DTC word to the SAE system letter.
 *
 *   bits 15–14  system
 *   0b00        P  (Powertrain)
 *   0b01        C  (Chassis)
 *   0b10        B  (Body)
 *   0b11        U  (Network/Communication)
 */
const DTC_SYSTEM_LETTERS = ['P', 'C', 'B', 'U'] as const;

/**
 * Decodes a single DTC byte pair into a 5-character SAE DTC string.
 *
 * Encoding (SAE J1979):
 *   bits 15–14 → system letter (P/C/B/U)
 *   bits 13–0  → 4 hex digits  (0000–3FFF)
 *
 * Examples:
 *   (0x01, 0x33) → value 0x0133 → P0133
 *   (0x04, 0x20) → value 0x0420 → P0420
 *   (0x42, 0x00) → value 0x4200 → C0200
 *   (0x92, 0x34) → value 0x9234 → B1234
 *   (0xC1, 0x01) → value 0xC101 → U0101
 *
 * Returns null for the null DTC (0x0000) which acts as a list terminator.
 */
export function decodeDtcPair(b1: number, b2: number): string | null {
  if (b1 === 0 && b2 === 0) return null;
  const value  = (b1 << 8) | b2;
  const system = DTC_SYSTEM_LETTERS[(value >> 14) & 0x03];
  const digits = (value & 0x3FFF).toString(16).toUpperCase().padStart(4, '0');
  return `${system}${digits}`;
}

/**
 * Parses a raw ELM327 response to a Mode 03 or Mode 07 command into an array
 * of SAE DTC strings.
 *
 * Response structure (after the mode byte is located):
 *   [mode byte: 0x43 or 0x47]  [DTC count]  [b1 b2] [b1 b2] ... [00 00]
 *
 * The mode byte is located by scanning rather than assuming position 0, which
 * makes the parser robust against command echo or header bytes when ATE0/ATH0
 * are not yet in effect.
 *
 * Handles:
 *  - Spaced ("43 02 01 33 04 20") and compact ("43020133042") hex
 *  - Multi-line responses with "0:"/"1:" line-number prefixes
 *  - Trailing ">" ELM327 prompts and command echo lines
 *  - NO DATA, STOPPED, ERROR and other ELM327 error tokens → []
 *  - Zero-count response ("43 00") → []
 *  - 0x00 0x00 sentinel terminator
 *
 * Returns an array of DTC strings (e.g. ["P0133", "P0420"]).
 * Always returns an empty array on failure — never throws.
 */
export function parseDtcResponse(raw: string): string[] {
  if (!raw) return [];

  const upper = raw.toUpperCase();

  for (const token of DTC_ERROR_TOKENS) {
    if (upper.includes(token)) return [];
  }

  // Strip "0:", "1:", ... line-number prefixes emitted by some adapters in
  // multi-frame responses even with ATH0 active.
  const stripped = upper
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\d+:\s*/, '').trim())
    .join(' ');

  // Collapse to a flat contiguous hex stream, then group into byte tokens.
  const bytes = stripped.replace(/[^0-9A-F]/g, '').match(/[0-9A-F]{2}/g) ?? [];

  // Scan for the mode response byte (0x43 = stored, 0x47 = pending).
  // Scanning rather than assuming position 0 handles command echo or stray
  // header bytes that may precede the response.
  let modeIdx = -1;
  for (let j = 0; j < bytes.length; j++) {
    const b = parseInt(bytes[j]!, 16);
    if (b === 0x43 || b === 0x47) { modeIdx = j; break; }
  }

  // Need mode byte + at least one count byte.
  if (modeIdx === -1 || modeIdx + 1 >= bytes.length) return [];

  const dtcCount = parseInt(bytes[modeIdx + 1]!, 16);
  if (dtcCount === 0) return [];

  const dtcs: string[] = [];

  // Process byte pairs starting after the mode and count bytes.
  // Two independent guards keep us safe:
  //   - dtcCount cap: never decode more DTCs than the adapter reported
  //   - 0x00 0x00 sentinel: terminates a padded list before dtcCount is reached
  for (
    let i = modeIdx + 2;
    i + 1 < bytes.length && dtcs.length < dtcCount;
    i += 2
  ) {
    const b1  = parseInt(bytes[i]!,     16);
    const b2  = parseInt(bytes[i + 1]!, 16);
    const dtc = decodeDtcPair(b1, b2);
    if (dtc === null) break;
    dtcs.push(dtc);
  }

  return dtcs;
}
