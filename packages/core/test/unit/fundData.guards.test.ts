import { describe, it, expect } from 'vitest';
import { toFiniteOrNull, toWeightPct, FetchedFundDataSchema } from '../../src/domain/fundData/types';
import { parseTickertapeFundData } from '../../src/domain/fundData/tickertape';

describe('fund-data numeric guards', () => {
  it('toFiniteOrNull rejects NaN/Infinity/blank, keeps finite numbers', () => {
    expect(toFiniteOrNull('1.53')).toBe(1.53);
    expect(toFiniteOrNull(0)).toBe(0);
    expect(toFiniteOrNull('N/A')).toBeNull();
    expect(toFiniteOrNull('')).toBeNull();
    expect(toFiniteOrNull(null)).toBeNull();
    expect(toFiniteOrNull(undefined)).toBeNull();
    expect(toFiniteOrNull(Infinity)).toBeNull();
  });

  it('toWeightPct coerces non-finite to 0 (aggregation-safe)', () => {
    expect(toWeightPct('12.5')).toBe(12.5);
    expect(toWeightPct('N/A')).toBe(0);
    expect(toWeightPct(undefined)).toBe(0);
    expect(toWeightPct(NaN)).toBe(0);
  });

  it('FetchedFundDataSchema rejects a NaN weightPct (backstop for future adapters)', () => {
    const bad = {
      source: 'groww' as const,
      asOfDate: '2026-08-31',
      fundamentals: {
        expenseRatioDirect: null, expenseRatioRegular: null, planType: null, aum: null,
        benchmarkName: null, stdDev: null, sharpe: null, beta: null, alpha: null, source: 'groww',
      },
      holdings: [{ securityName: 'X', isin: null, weightPct: NaN, sector: null, marketCapBucket: null }],
    };
    expect(() => FetchedFundDataSchema.parse(bad)).toThrow();
  });

  it('adapter coerces a malformed weight to 0 instead of NaN-polluting the result', () => {
    const r = parseTickertapeFundData(
      { data: { currentAllocation: [{ title: 'HDFC', latest: 'N/A', type: 'Financials' }] } },
      '100001',
    );
    expect(r.holdings[0].securityName).toBe('HDFC');
    expect(r.holdings[0].weightPct).toBe(0);
    expect(Number.isNaN(r.holdings[0].weightPct)).toBe(false);
  });
});
