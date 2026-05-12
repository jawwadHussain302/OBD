import { TestBed } from '@angular/core/testing';
import { SessionComparisonService } from './session-comparison.service';
import type { HistoryEntry } from '../diagnostics/diagnosis-history.service';
import type { DeepDiagnosisState } from '../diagnostics/deep-diagnosis.service';

// ── Minimal factory helpers ───────────────────────────────────────────────────

function makeState(overrides: Partial<DeepDiagnosisState> = {}): DeepDiagnosisState {
  return {
    status: 'completed',
    currentStep: 'completed',
    instruction: '',
    progress: 100,
    findings: [],
    results: [],
    ...overrides,
  } as DeepDiagnosisState;
}

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id:          overrides.id          ?? 'dx_1',
    savedAt:     overrides.savedAt     ?? Date.now(),
    vehicleName: overrides.vehicleName ?? 'Test Vehicle',
    severity:    overrides.severity    ?? null,
    dtcCount:    overrides.dtcCount    ?? 0,
    isPartial:   overrides.isPartial   ?? false,
    primaryIssue: overrides.primaryIssue ?? null,
    state:       overrides.state       ?? makeState(),
  };
}

function dtc(code: string, title = '') {
  return { code, title, description: '', source: 'generic' as const };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionComparisonService', () => {
  let service: SessionComparisonService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionComparisonService);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('rejects same-id entries', () => {
    const entry = makeEntry({ id: 'dx_1' });
    const outcome = service.compare(entry, entry);
    expect(outcome.ok).toBeFalse();
    if (!outcome.ok) expect(outcome.error.reason).toBe('same_session');
  });

  it('rejects mismatched VINs', () => {
    const earlier = makeEntry({ id: 'dx_1', state: makeState({ vin: 'WBA12345' } as never) });
    const later   = makeEntry({ id: 'dx_2', state: makeState({ vin: 'WBA99999' } as never) });
    const outcome = service.compare(earlier, later);
    expect(outcome.ok).toBeFalse();
    if (!outcome.ok) expect(outcome.error.reason).toBe('vin_mismatch');
  });

  it('accepts sessions with no VIN even if vehicleName differs', () => {
    const earlier = makeEntry({ id: 'dx_1', vehicleName: 'Car A' });
    const later   = makeEntry({ id: 'dx_2', vehicleName: 'Car B' });
    const outcome = service.compare(earlier, later);
    expect(outcome.ok).toBeTrue();
  });

  // ── DTC comparison ──────────────────────────────────────────────────────────

  it('classifies resolved, persisted, and new DTCs correctly', () => {
    /**
     * Example scenario:
     *   Earlier session: P0171 (lean), P0300 (misfire)
     *   Later  session: P0300 (misfire persists), P0401 (new EGR fault)
     *
     *   Expected:
     *     fixedIssues:  ['P0171 — ...']   (disappeared)
     *     stillPresent: ['P0300 — ...']   (both sessions)
     *     newIssues:    ['P0401 — ...']   (only in later)
     */
    const earlier = makeEntry({
      id: 'dx_a',
      state: makeState({ dtcCodes: [
        dtc('P0171', 'System Too Lean'),
        dtc('P0300', 'Random Misfire'),
      ]}),
    });
    const later = makeEntry({
      id: 'dx_b',
      state: makeState({ dtcCodes: [
        dtc('P0300', 'Random Misfire'),
        dtc('P0401', 'EGR Flow Insufficient'),
      ]}),
    });

    const outcome = service.compare(earlier, later);
    expect(outcome.ok).toBeTrue();
    if (!outcome.ok) return;

    const r = outcome.result;
    expect(r.fixedIssues.length).toBe(1);
    expect(r.fixedIssues[0]).toContain('P0171');
    expect(r.stillPresent.length).toBe(1);
    expect(r.stillPresent[0]).toContain('P0300');
    expect(r.newIssues.length).toBe(1);
    expect(r.newIssues[0]).toContain('P0401');
    expect(r.repairEffectiveness).toBe('partial');
  });

  it('marks repair as successful when all DTCs are cleared and no new ones appear', () => {
    const earlier = makeEntry({
      id: 'dx_a',
      severity: { score: 75, level: 'High' },
      state: makeState({ dtcCodes: [dtc('P0171', 'Lean')] }),
    });
    const later = makeEntry({
      id: 'dx_b',
      severity: { score: 10, level: 'Low' },
      state: makeState({ dtcCodes: [] }),
    });

    const outcome = service.compare(earlier, later);
    expect(outcome.ok).toBeTrue();
    if (!outcome.ok) return;

    const r = outcome.result;
    expect(r.fixedIssues.length).toBe(1);
    expect(r.stillPresent.length).toBe(0);
    expect(r.newIssues.length).toBe(0);
    expect(r.repairEffectiveness).toBe('successful');
    expect(r.improvedMetrics.some(m => m.includes('High') && m.includes('Low'))).toBeTrue();
  });

  it('marks repair as worsened when new DTCs appear and none are fixed', () => {
    const earlier = makeEntry({
      id: 'dx_a',
      severity: { score: 30, level: 'Low' },
      state: makeState({ dtcCodes: [] }),
    });
    const later = makeEntry({
      id: 'dx_b',
      severity: { score: 80, level: 'High' },
      state: makeState({ dtcCodes: [dtc('P0300', 'Misfire'), dtc('P0420', 'Catalyst')] }),
    });

    const outcome = service.compare(earlier, later);
    expect(outcome.ok).toBeTrue();
    if (!outcome.ok) return;

    const r = outcome.result;
    expect(r.newIssues.length).toBe(2);
    expect(r.fixedIssues.length).toBe(0);
    expect(r.repairEffectiveness).toBe('worsened');
  });

  it('marks repair as no_change when DTCs and severity are identical', () => {
    const state = makeState({
      dtcCodes: [dtc('P0171', 'Lean')],
      severity: { score: 50, level: 'Medium' },
    });
    const earlier = makeEntry({ id: 'dx_a', severity: { score: 50, level: 'Medium' }, state });
    const later   = makeEntry({ id: 'dx_b', severity: { score: 50, level: 'Medium' }, state: { ...state } });

    const outcome = service.compare(earlier, later);
    expect(outcome.ok).toBeTrue();
    if (!outcome.ok) return;

    expect(outcome.result.repairEffectiveness).toBe('no_change');
  });

  // ── Conclusion text ─────────────────────────────────────────────────────────

  it('produces a non-empty overallConclusion in all cases', () => {
    const earlier = makeEntry({ id: 'dx_a', state: makeState() });
    const later   = makeEntry({ id: 'dx_b', state: makeState() });
    const outcome = service.compare(earlier, later);
    expect(outcome.ok).toBeTrue();
    if (!outcome.ok) return;
    expect(outcome.result.overallConclusion.length).toBeGreaterThan(10);
  });
});
