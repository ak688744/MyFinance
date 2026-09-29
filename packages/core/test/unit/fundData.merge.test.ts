import { describe, it, expect } from 'vitest';
import { mergeFundData } from '../../src/domain/fundData/merge';
import type { FetchedFundData } from '../../src/types';

const groww: FetchedFundData = { source: 'groww', asOfDate: '2026-08-31',
  fundamentals: { expenseRatioDirect: null, expenseRatioRegular: null, planType: null, aum: null, benchmarkName: 'Nifty 50', stdDev: null, sharpe: 1.2, beta: null, alpha: null, source: 'groww' },
  holdings: [{ securityName: 'HDFC', isin: null, weightPct: 9, sector: 'Financials', marketCapBucket: 'large' }] };
const kuvera: FetchedFundData = { source: 'kuvera', asOfDate: '2026-08-31',
  fundamentals: { expenseRatioDirect: 0.4, expenseRatioRegular: 1.4, planType: null, aum: 15000, benchmarkName: null, stdDev: null, sharpe: null, beta: null, alpha: null, source: 'kuvera' },
  holdings: [] };

describe('mergeFundData', () => {
  it('keeps primary holdings and back-fills fundamentals from others', () => {
    const m = mergeFundData(groww, kuvera);
    expect(m.holdings).toHaveLength(1);
    expect(m.fundamentals.expenseRatioRegular).toBe(1.4);
    expect(m.fundamentals.sharpe).toBe(1.2);
    expect(m.fundamentals.benchmarkName).toBe('Nifty 50');
    expect(m.fundamentals.aum).toBe(15000);
  });
  it('uses another source holdings if primary has none', () => {
    const m = mergeFundData(kuvera, groww);
    expect(m.holdings).toHaveLength(1);
    expect(m.asOfDate).toBe('2026-08-31');
  });
});
