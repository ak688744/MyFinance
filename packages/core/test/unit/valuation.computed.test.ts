import { describe, it, expect } from 'vitest';
import {
  valueComputedAsset,
  compoundContribution,
} from '../../src/domain/valuation/computed';
import type { Asset, AssetContribution, AssetRate } from '../../src/types';

const FREQ = { monthly: 12, quarterly: 4, half_yearly: 2, yearly: 1 };

function fd(params: Record<string, unknown> = {}): Asset {
  return {
    id: 1, accountId: 1, assetClass: 'fd', name: 'FD',
    valuationStrategy: 'computed', ingestionMode: 'manual_entry',
    params: { compounding: 'quarterly', ...params },
    status: 'active', openedAt: null,
  };
}

describe('compoundContribution', () => {
  it('matches the FD closed form A = P(1 + r/n)^(n·t) for one rate period', () => {
    const rates: AssetRate[] = [
      { id: 1, assetId: 1, effectiveFrom: '2023-01-01', rate: 8 },
    ];
    const v = compoundContribution(100000, '2024-01-01', '2025-01-01', rates, 4);
    // t = 366/365 yr (2024 is a leap year); day-count is days/365 per spec (yearsBetween).
    expect(v).toBeCloseTo(100000 * Math.pow(1.02, 4 * (366 / 365)), 2);
  });

  it('switches rate at a period boundary (PPF-style rate change)', () => {
    const rates: AssetRate[] = [
      { id: 1, assetId: 1, effectiveFrom: '2023-01-01', rate: 8 },
      { id: 2, assetId: 1, effectiveFrom: '2024-07-01', rate: 7 },
    ];
    const v = compoundContribution(100000, '2024-01-01', '2025-01-01', rates, 1);
    const y1 = 182 / 365, y2 = 184 / 365;
    const expected = 100000 * Math.pow(1.08, y1) * Math.pow(1.07, y2);
    expect(v).toBeCloseTo(expected, 2);
  });

  it('uses the earliest rate for dates before the first effective_from', () => {
    const rates: AssetRate[] = [
      { id: 1, assetId: 1, effectiveFrom: '2024-06-01', rate: 7.1 },
    ];
    const v = compoundContribution(1000, '2024-01-01', '2025-01-01', rates, 1);
    // 366/365 yr (leap year); rate before first effective_from falls back to earliest rate.
    expect(v).toBeCloseTo(1000 * Math.pow(1.071, 366 / 365), 2);
  });
});

describe('valueComputedAsset', () => {
  it('FD: single contribution compounded to today', () => {
    const asset = fd();
    const contributions: AssetContribution[] = [
      { id: 1, assetId: 1, contributionDate: '2024-01-01', amount: 100000, note: null },
    ];
    const rates: AssetRate[] = [
      { id: 1, assetId: 1, effectiveFrom: '2023-01-01', rate: 8 },
    ];
    const r = valueComputedAsset(asset, contributions, rates, new Date(2025, 0, 1));
    expect(r.invested).toBe(100000);
    // t = 366/365 yr (2024 leap year), days/365 convention.
    expect(r.currentValue).toBeCloseTo(100000 * Math.pow(1.02, 4 * (366 / 365)), 2);
    expect(r.returns).toBeCloseTo(r.currentValue - 100000, 2);
  });

  it('PPF: sums multiple contributions each compounded from its own date', () => {
    const asset: Asset = { ...fd({ compounding: 'yearly' }), assetClass: 'ppf' };
    const contributions: AssetContribution[] = [
      { id: 1, assetId: 1, contributionDate: '2023-01-01', amount: 50000, note: null },
      { id: 2, assetId: 1, contributionDate: '2024-01-01', amount: 50000, note: null },
    ];
    const rates: AssetRate[] = [
      { id: 1, assetId: 1, effectiveFrom: '2020-01-01', rate: 7 },
    ];
    const today = new Date(2025, 0, 1);
    const r = valueComputedAsset(asset, contributions, rates, today);
    // days/365 convention: 2023-01-01→2025-01-01 = 731 days (2024 leap);
    // 2024-01-01→2025-01-01 = 366 days.
    const expected =
      50000 * Math.pow(1.07, 731 / 365) + 50000 * Math.pow(1.07, 366 / 365);
    expect(r.invested).toBe(100000);
    expect(r.currentValue).toBeCloseTo(expected, 1);
  });

  it('FD cumulative: stops growing after maturity_date', () => {
    const asset = fd({ compounding: 'quarterly', maturityDate: '2024-07-01', payout: 'cumulative' });
    const contributions: AssetContribution[] = [
      { id: 1, assetId: 1, contributionDate: '2024-01-01', amount: 100000, note: null },
    ];
    const rates: AssetRate[] = [
      { id: 1, assetId: 1, effectiveFrom: '2023-01-01', rate: 8 },
    ];
    const atMaturity = valueComputedAsset(asset, contributions, rates, new Date(2024, 6, 1));
    const wayLater = valueComputedAsset(asset, contributions, rates, new Date(2030, 0, 1));
    expect(wayLater.currentValue).toBeCloseTo(atMaturity.currentValue, 2);
  });

  it('returns 0 current value and 0 invested for no contributions', () => {
    const r = valueComputedAsset(fd(), [], [{ id: 1, assetId: 1, effectiveFrom: '2020-01-01', rate: 7 }], new Date(2025, 0, 1));
    expect(r.currentValue).toBe(0);
    expect(r.invested).toBe(0);
  });
});
