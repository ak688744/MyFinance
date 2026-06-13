import { describe, it, expect } from 'vitest';
import { valueManualAsset } from '../../src/domain/valuation/manual';
import type { Asset, AssetValuation } from '../../src/types';

const gold: Asset = {
  id: 5, accountId: 2, assetClass: 'gold', name: 'Gold',
  valuationStrategy: 'manual', ingestionMode: 'manual_entry',
  params: { grams: 50 }, status: 'active', openedAt: null,
};

describe('valueManualAsset', () => {
  it('uses the latest valuation by valued_at and computes ageDays', () => {
    const valuations: AssetValuation[] = [
      { id: 1, assetId: 5, value: 300000, valuedAt: '2025-01-01', note: null },
      { id: 2, assetId: 5, value: 350000, valuedAt: '2025-06-01', note: null },
    ];
    const r = valueManualAsset(gold, valuations, new Date(2025, 5, 11)); // 2025-06-11
    expect(r.currentValue).toBe(350000);
    expect(r.valuedAt).toBe('2025-06-01');
    expect(r.ageDays).toBe(10);
    expect(r.invested).toBeNull();
    expect(r.returns).toBeNull();
  });

  it('returns 0 value when there are no valuations', () => {
    const r = valueManualAsset(gold, [], new Date(2025, 5, 11));
    expect(r.currentValue).toBe(0);
    expect(r.valuedAt).toBeUndefined();
  });
});
