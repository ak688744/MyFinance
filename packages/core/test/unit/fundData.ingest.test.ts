import { describe, it, expect } from 'vitest';
import { ingestFundData } from '../../src/domain/fundData/ingest';
import type { FetchedFundData } from '../../src/types';
import type { SchemeRepo } from '../../src/repositories/types';

function fakeRepos() {
  const fundamentals: unknown[] = [];
  const holdings = new Map<string, unknown[]>();
  return {
    schemeRepo: {
      getByAmfiCode: () => ({ id: 7, schemeName: 'A', amfiCode: '100001', isin: null, amcName: null, category: null, subCategory: null }),
    } as unknown as SchemeRepo,
    fundamentalsRepo: { upsert: (r: unknown) => fundamentals.push(r), get: () => null },
    holdingsRepo: {
      replaceSnapshot: (id: number, date: string, rows: unknown[]) => holdings.set(`${id}:${date}`, rows),
      getLatestSnapshot: () => [], listAsOfDates: () => [], prune: () => 0,
    },
    runInTransaction: <T,>(fn: () => T) => fn(),
    _fundamentals: fundamentals,
    _holdings: holdings,
  };
}
const canned = (source: 'groww' | 'kuvera'): FetchedFundData => ({ source, asOfDate: '2026-08-31',
  fundamentals: { expenseRatioDirect: 0.4, expenseRatioRegular: 1.4, planType: null, aum: 1, benchmarkName: 'X', stdDev: null, sharpe: null, beta: null, alpha: null, source },
  holdings: [{ securityName: 'HDFC', isin: null, weightPct: 9, sector: null, marketCapBucket: null }] });

describe('ingestFundData', () => {
  it('fetches, merges, and writes fundamentals + holdings + prunes', async () => {
    const r = fakeRepos();
    const out = await ingestFundData({ ...r, adapters: [{ source: 'groww', fetch: async () => canned('groww') }] }, '100001');
    expect(out.schemeId).toBe(7);
    expect(out.holdingsCount).toBe(1);
    expect(r._fundamentals).toHaveLength(1);
    expect(r._holdings.get('7:2026-08-31')).toHaveLength(1);
  });
  it('skips a throwing adapter but succeeds on another; rethrows if all fail', async () => {
    const r = fakeRepos();
    const out = await ingestFundData({ ...r, adapters: [
      { source: 'groww', fetch: async () => { throw new Error('down'); } },
      { source: 'kuvera', fetch: async () => canned('kuvera') },
    ] }, '100001');
    expect(out.source).toBe('kuvera');
    await expect(ingestFundData({ ...r, adapters: [{ source: 'groww', fetch: async () => { throw new Error('x'); } }] }, '100001'))
      .rejects.toThrow();
  });
});
