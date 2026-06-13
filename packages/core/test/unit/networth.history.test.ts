import { describe, it, expect } from 'vitest';
import { getNetWorthHistory } from '../../src/domain/networth/networth';
import type { Asset, AssetValuation, Liability } from '../../src/types';
import type {
  AssetRepo, AssetContributionRepo, AssetRateRepo, AssetValuationRepo, LiabilityRepo,
} from '../../src/repositories/types';

const gold: Asset = {
  id: 11, accountId: 3, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual',
  ingestionMode: 'manual_entry', params: null, status: 'active', openedAt: null,
};
const valuations: AssetValuation[] = [
  { id: 1, assetId: 11, value: 100000, valuedAt: '2024-06-01', note: null },
  { id: 2, assetId: 11, value: 200000, valuedAt: '2025-01-01', note: null },
];

const deps = {
  assetRepo: { list: () => [gold], getById: () => gold, create: () => 0, update: () => {}, delete: () => {} } as AssetRepo,
  contributionRepo: { listByAsset: () => [], insert: () => 0 } as AssetContributionRepo,
  rateRepo: { listByAsset: () => [], insert: () => 0 } as AssetRateRepo,
  valuationRepo: { listByAsset: () => valuations, insert: () => 0 } as AssetValuationRepo,
  liabilityRepo: { list: () => [] as Liability[], getById: () => null, create: () => 0, update: () => {}, delete: () => {} } as LiabilityRepo,
  getMfHoldings: async () => [],
  mfValueAt: async () => 0,
};

describe('getNetWorthHistory', () => {
  it('manual asset reflects the valuation in effect at each sample date', async () => {
    const series = await getNetWorthHistory(
      deps,
      { dates: ['2024-07-01', '2025-02-01'] },
    );
    expect(series[0]).toMatchObject({ date: '2024-07-01' });
    expect(series[0].totalAssets).toBe(100000); // only the 2024-06-01 valuation applies
    expect(series[1].totalAssets).toBe(200000); // 2025-01-01 valuation now applies
  });
});
