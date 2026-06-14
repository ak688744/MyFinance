import { describe, it, expect } from 'vitest';
import { valueAsset } from '../../src/domain/valuation';
import type { Asset } from '../../src/types';

const base = {
  accountId: 1, ingestionMode: 'manual_entry' as const,
  status: 'active' as const, openedAt: null,
};

describe('valueAsset dispatcher', () => {
  it('routes computed assets to the compound engine', () => {
    const asset: Asset = {
      ...base, id: 1, assetClass: 'fd', name: 'FD',
      valuationStrategy: 'computed', params: { compounding: 'yearly' },
    };
    const r = valueAsset(
      asset,
      { contributions: [{ id: 1, assetId: 1, contributionDate: '2024-01-01', amount: 1000, note: null }],
        rates: [{ id: 1, assetId: 1, effectiveFrom: '2020-01-01', rate: 10 }],
        valuations: [] },
      new Date(2025, 0, 1),
    );
    expect(r.valuationStrategy).toBe('computed');
    expect(r.currentValue).toBeCloseTo(1000 * Math.pow(1.1, 366 / 365), 1);
  });

  it('routes manual assets to the stated-value engine', () => {
    const asset: Asset = {
      ...base, id: 2, assetClass: 'gold', name: 'Gold',
      valuationStrategy: 'manual', params: null,
    };
    const r = valueAsset(
      asset,
      { contributions: [], rates: [],
        valuations: [{ id: 1, assetId: 2, value: 5000, valuedAt: '2025-01-01', note: null }] },
      new Date(2025, 0, 1),
    );
    expect(r.valuationStrategy).toBe('manual');
    expect(r.currentValue).toBe(5000);
  });
});
