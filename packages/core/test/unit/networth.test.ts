import { describe, it, expect } from 'vitest';
import { getAllAssets, getNetWorth } from '../../src/domain/networth/networth';
import type {
  Asset, AssetContribution, AssetRate, AssetValuation, Liability, Holding,
} from '../../src/types';
import type {
  AssetRepo, AssetContributionRepo, AssetRateRepo, AssetValuationRepo, LiabilityRepo,
} from '../../src/repositories/types';

// ── Fakes ──
function fakeAssetRepo(rows: Asset[]): AssetRepo {
  return {
    list: (f) => rows.filter((a) =>
      (f?.account === undefined || a.accountId === f.account) &&
      (f?.assetClass === undefined || a.assetClass === f.assetClass) &&
      (f?.status === undefined || a.status === f.status)),
    getById: (id) => rows.find((a) => a.id === id) ?? null,
    create: () => 0, update: () => {}, delete: () => {},
  };
}
const contribRepo = (m: Record<number, AssetContribution[]>): AssetContributionRepo =>
  ({ listByAsset: (id) => m[id] ?? [], insert: () => 0 });
const rateRepo = (m: Record<number, AssetRate[]>): AssetRateRepo =>
  ({ listByAsset: (id) => m[id] ?? [], insert: () => 0 });
const valRepo = (m: Record<number, AssetValuation[]>): AssetValuationRepo =>
  ({ listByAsset: (id) => m[id] ?? [], insert: () => 0 });
const liabRepo = (rows: Liability[]): LiabilityRepo =>
  ({ list: (f) => rows.filter((l) => f?.status === undefined || l.status === f.status),
     getById: (id) => rows.find((l) => l.id === id) ?? null,
     create: () => 0, update: () => {}, delete: () => {} });

const mfHolding: Holding = {
  id: 1, schemeId: 1, schemeName: 'MF', amcName: 'AMC', category: 'equity',
  subCategory: null, folioNumber: null, accountName: 'Groww', investmentApp: 'Groww',
  units: 10, investedValue: 1000, currentValue: 1500, returnsAmount: 500,
  returnsPercent: 50, returnsXirr: 12, asOfDate: '2025-01-01',
};

const fd: Asset = {
  id: 10, accountId: 2, assetClass: 'fd', name: 'FD', valuationStrategy: 'computed',
  ingestionMode: 'manual_entry', params: { compounding: 'yearly' }, status: 'active', openedAt: null,
};
const gold: Asset = {
  id: 11, accountId: 3, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual',
  ingestionMode: 'manual_entry', params: null, status: 'active', openedAt: null,
};

function deps() {
  return {
    assetRepo: fakeAssetRepo([fd, gold]),
    contributionRepo: contribRepo({ 10: [{ id: 1, assetId: 10, contributionDate: '2024-01-01', amount: 100000, note: null }] }),
    rateRepo: rateRepo({ 10: [{ id: 1, assetId: 10, effectiveFrom: '2020-01-01', rate: 10 }] }),
    valuationRepo: valRepo({ 11: [{ id: 1, assetId: 11, value: 200000, valuedAt: '2025-01-01', note: null }] }),
    liabilityRepo: liabRepo([
      { id: 1, accountId: null, name: 'Home', loanType: 'home', principal: 1000000,
        annualRate: 9, tenureMonths: 120, emiAmount: null, startDate: '2024-01-01', status: 'active' },
    ]),
    getMfHoldings: async () => [mfHolding],
  };
}

const TODAY = new Date(2025, 0, 1);

describe('getAllAssets', () => {
  it('unions MF holdings (projected) with computed + manual assets', async () => {
    const all = await getAllAssets(deps(), {}, TODAY);
    const classes = all.map((a) => a.assetClass).sort();
    expect(classes).toEqual(['fd', 'gold', 'mutual_fund']);
    const mf = all.find((a) => a.assetClass === 'mutual_fund')!;
    expect(mf.valuationStrategy).toBe('market');
    expect(mf.currentValue).toBe(1500);
    const goldRow = all.find((a) => a.assetClass === 'gold')!;
    expect(goldRow.currentValue).toBe(200000);
    expect(goldRow.valuationStrategy).toBe('manual');
  });
});

describe('getNetWorth', () => {
  it('netWorth = Σ asset values − Σ liability outstanding, with per-class breakdown', async () => {
    const nw = await getNetWorth(deps(), {}, TODAY);
    // assets: MF 1500 + FD(100000*1.1^(366/365)) + gold 200000
    const fdVal = 100000 * Math.pow(1.1, 366 / 365);
    const expectedAssets = 1500 + fdVal + 200000;
    expect(nw.totalAssets).toBeCloseTo(expectedAssets, 0);
    expect(nw.totalLiabilities).toBeGreaterThan(0);
    expect(nw.netWorth).toBeCloseTo(nw.totalAssets - nw.totalLiabilities, 4);
    // breakdown sums to totalAssets and percentages to ~100
    const sum = nw.byAssetClass.reduce((s, c) => s + c.value, 0);
    expect(sum).toBeCloseTo(nw.totalAssets, 0);
    expect(nw.byAssetClass.reduce((s, c) => s + c.percentage, 0)).toBeCloseTo(100, 4);
  });
});
