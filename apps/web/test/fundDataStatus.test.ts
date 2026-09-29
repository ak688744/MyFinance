import { describe, it, expect } from 'vitest';
import { needsRefresh } from '../src/features/investments/FundDataStatus';
import type { FundDataCoverage } from '../src/types';

const row = (o: Partial<FundDataCoverage>): FundDataCoverage => ({
  schemeId: 1, schemeName: 'F', amfiCode: '1', hasHoldings: true, asOfDate: '2026-09-01', ageDays: 10, refreshable: true, ...o,
});

describe('needsRefresh', () => {
  it('is false when all refreshable funds are fresh', () => {
    expect(needsRefresh([row({}), row({ schemeId: 2 })])).toBe(false);
  });
  it('is true for a refreshable fund with no holdings', () => {
    expect(needsRefresh([row({ hasHoldings: false, asOfDate: null, ageDays: null })])).toBe(true);
  });
  it('is true for a snapshot older than 35 days', () => {
    expect(needsRefresh([row({ ageDays: 60 })])).toBe(true);
  });
  it('ignores funds that can never be refreshed', () => {
    expect(needsRefresh([row({ refreshable: false, amfiCode: null, hasHoldings: false, asOfDate: null, ageDays: null })])).toBe(false);
  });
});
