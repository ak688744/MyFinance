import { describe, it, expect } from 'vitest';
import { groupHoldingsByClass, allocationToChartData, summaryByCategoryWithNames } from './transforms';

describe('groupHoldingsByClass', () => {
  it('splits MF holdings from generic assets by assetClass', () => {
    const mf = [{ name: 'Fund A', currentValue: 100, assetClass: 'mutual_fund' }];
    const assets = [
      { assetId: 1, name: 'FD 1', assetClass: 'fd', currentValue: 50, valuationStrategy: 'computed' },
      { assetId: 2, name: 'Gold', assetClass: 'gold', currentValue: 30, valuationStrategy: 'manual' },
    ];
    const groups = groupHoldingsByClass(mf as any, assets as any);
    const fd = groups.find((g) => g.assetClass === 'fd');
    expect(fd?.items).toHaveLength(1);
    expect(fd?.totalValue).toBe(50);
    expect(fd?.valuationStrategy).toBe('computed');
    expect(groups.find((g) => g.assetClass === 'mutual_fund')?.totalValue).toBe(100);
  });
});

describe('allocationToChartData', () => {
  it('maps byAssetClass into name/value/percentage rows', () => {
    const rows = allocationToChartData([
      { assetClass: 'mutual_fund', value: 75, percentage: 75 },
      { assetClass: 'fd', value: 25, percentage: 25 },
    ]);
    expect(rows).toEqual([
      { name: 'Mutual Funds', value: 75, percentage: 75 },
      { name: 'Fixed Deposits', value: 25, percentage: 25 },
    ]);
  });
});

describe('summaryByCategoryWithNames', () => {
  it('joins category ids to names, falling back to Uncategorized', () => {
    const cats = [{ id: 'food', name: 'Food' }];
    const rows = summaryByCategoryWithNames(
      [{ categoryId: 'food', amount: 100 }, { categoryId: null, amount: 40 }],
      cats as any,
    );
    expect(rows).toEqual([
      { categoryId: 'food', name: 'Food', amount: 100 },
      { categoryId: null, name: 'Uncategorized', amount: 40 },
    ]);
  });
});
