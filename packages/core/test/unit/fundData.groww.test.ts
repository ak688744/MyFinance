import { describe, it, expect } from 'vitest';
import { parseGrowwFundData } from '../../src/domain/fundData/groww';
import fixture from '../fixtures/fundData/groww-fund-a.json';

describe('parseGrowwFundData', () => {
  it('normalizes holdings + fundamentals from mfServerSideData', () => {
    const r = parseGrowwFundData(fixture, '100001');
    expect(r.source).toBe('groww');
    expect(r.holdings.length).toBeGreaterThan(0);
    expect(r.holdings[0]).toHaveProperty('weightPct');
    expect(r.holdings[0]).toHaveProperty('securityName');
    expect(typeof r.asOfDate).toBe('string');
    expect(r.fundamentals.source).toBe('groww');
    expect(r.fundamentals.benchmarkName).toContain('NIFTY');
    expect(r.fundamentals.expenseRatioDirect).toBe(1.53);
  });
});
