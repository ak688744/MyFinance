import { describe, it, expect } from 'vitest';
import { parseKuveraFundData } from '../../src/domain/fundData/kuvera';
import fixture from '../fixtures/fundData/kuvera-fund-a.json';

describe('parseKuveraFundData', () => {
  it('parses the real v5 array shape into fundamentals with empty holdings', () => {
    const r = parseKuveraFundData(fixture, '122639');
    expect(r.source).toBe('kuvera');
    expect(r.holdings).toHaveLength(0);
    expect(r.fundamentals.expenseRatioDirect).toBe(0.62);
    expect(r.fundamentals.aum).toBe(1484290);
    expect(r.fundamentals.planType).toBe('direct'); // from "...Direct Plan"
    // regular ER / benchmark / risk are absent in the real Kuvera detail payload
    expect(r.fundamentals.expenseRatioRegular).toBeNull();
  });
});
