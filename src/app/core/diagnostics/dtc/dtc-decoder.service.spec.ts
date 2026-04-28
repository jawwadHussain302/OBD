import { TestBed } from '@angular/core/testing';
import { DtcDecoderService } from './dtc-decoder.service';

describe('DtcDecoderService', () => {
  let service: DtcDecoderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DtcDecoderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('decode()', () => {
    it('returns generic code with source=generic', () => {
      const result = service.decode('P0171');
      expect(result.code).toBe('P0171');
      expect(result.source).toBe('generic');
      expect(result.description).toContain('lean');
      expect(result.category).toBe('Powertrain');
      expect(result.subsystem).toBe('Fuel Trim');
    });

    it('normalises lowercase input', () => {
      const result = service.decode('p0300');
      expect(result.code).toBe('P0300');
      expect(result.source).toBe('generic');
    });

    it('normalises input with leading/trailing spaces', () => {
      const result = service.decode('  P0101  ');
      expect(result.code).toBe('P0101');
    });

    it('returns manufacturer code when manufacturer provided and code exists in that map', () => {
      const result = service.decode('P1135', 'toyota');
      expect(result.code).toBe('P1135');
      expect(result.source).toBe('manufacturer');
      expect(result.manufacturer).toBe('Toyota');
    });

    it('falls back to generic map when manufacturer is provided but code not in manufacturer map', () => {
      const result = service.decode('P0300', 'toyota');
      expect(result.source).toBe('generic');
      expect(result.description).toContain('misfire');
    });

    it('returns unknown for unrecognised code with no manufacturer', () => {
      const result = service.decode('P9999');
      expect(result.code).toBe('P9999');
      expect(result.source).toBe('unknown');
      expect(result.description).toBe('Unknown diagnostic trouble code');
    });

    it('returns unknown for unrecognised code even with manufacturer', () => {
      const result = service.decode('P9999', 'toyota');
      expect(result.source).toBe('unknown');
    });

    it('returns unknown for unrecognised manufacturer name', () => {
      const result = service.decode('P1135', 'honda');
      expect(result.source).toBe('unknown');
    });

    it('populates title on known generic code', () => {
      const result = service.decode('P0420');
      expect(result.title).toBeTruthy();
      expect(result.category).toBe('Powertrain');
      expect(result.subsystem).toBe('Catalyst');
    });

    it('populates possibleCauses array', () => {
      const result = service.decode('P0455');
      expect(Array.isArray(result.possibleCauses)).toBe(true);
      expect((result.possibleCauses ?? []).length).toBeGreaterThan(0);
    });
  });

  describe('decodeMany()', () => {
    it('decodes an array of codes', () => {
      const results = service.decodeMany(['P0171', 'P0300', 'P0301']);
      expect(results.length).toBe(3);
      expect(results[0].code).toBe('P0171');
      expect(results[1].code).toBe('P0300');
      expect(results[2].code).toBe('P0301');
    });

    it('returns empty array for empty input', () => {
      expect(service.decodeMany([])).toEqual([]);
    });

    it('passes manufacturer to each decode call', () => {
      const results = service.decodeMany(['P1135', 'P0171'], 'toyota');
      expect(results[0].source).toBe('manufacturer');
      expect(results[1].source).toBe('generic');
    });
  });
});
