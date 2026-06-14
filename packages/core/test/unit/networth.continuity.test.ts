import { describe, it, expect } from 'vitest';
import { getNetWorth } from '../../src/domain/networth/networth';
import { getPortfolioSummary } from '../../src/domain/portfolio';
import type { InvestmentTxRepo } from '../../src/repositories/types';
import type { NavLookup, TransactionWithSchemeMeta, Holding } from '../../src/types';
import type {
  AssetRepo, AssetContributionRepo, AssetRateRepo, AssetValuationRepo, LiabilityRepo,
} from '../../src/repositories/types';

const rows: TransactionWithSchemeMeta[] = [
  { schemeId: 1, schemeName: 'A', accountName: 'Groww', investmentApp: 'Groww',
    transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-01-01',
    amfiCode: '1', amcName: 'AMC', category: 'equity', subCategory: null },
];
const txRepo = {
  getTransactions: () => [], getTransactionsByScheme: () => [], getCashFlows: () => [],
  getTransactionSummary: () => { throw new Error('x'); },
  getEarliestTransactionDate: () => '2024-01-01',
  getUnitsPerSchemeUpTo: () => new Map(),
  getTransactionsWithSchemeMeta: () => rows,
  getAccounts: () => ['Groww'], insert: () => 0, deleteByAccountAppDateRange: () => 0,
} as InvestmentTxRepo;
const nav: NavLookup = { getLatestNAV: async () => 15, getNAVForDate: async () => null };

const emptyAssetRepo: AssetRepo = { list: () => [], getById: () => null, create: () => 0, update: () => {}, delete: () => {} };
const emptyChild = { listByAsset: () => [], insert: () => 0 };
const emptyLiab: LiabilityRepo = { list: () => [], getById: () => null, create: () => 0, update: () => {}, delete: () => {} };

const TODAY = new Date(2025, 0, 1);

describe('net-worth continuity with MF-only data', () => {
  it('totalAssets equals getPortfolioSummary.totalCurrentValue', async () => {
    const summary = await getPortfolioSummary({ txRepo, nav }, undefined, TODAY);
    const nw = await getNetWorth(
      {
        assetRepo: emptyAssetRepo,
        contributionRepo: emptyChild as AssetContributionRepo,
        rateRepo: emptyChild as AssetRateRepo,
        valuationRepo: emptyChild as AssetValuationRepo,
        liabilityRepo: emptyLiab,
        getMfHoldings: (filters) => import('../../src/domain/portfolio').then((m) => m.getHoldings({ txRepo, nav }, filters, TODAY)),
      },
      {},
      TODAY,
    );
    expect(nw.totalAssets).toBeCloseTo(summary.totalCurrentValue, 6);
    expect(nw.totalLiabilities).toBe(0);
    expect(nw.netWorth).toBeCloseTo(summary.totalCurrentValue, 6);
  });
});
