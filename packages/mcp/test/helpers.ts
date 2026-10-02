import { buildContext, type McpContext, type MarketData, type FundData, type FundDetails } from '../src/context';
import type { SchemeInfo, NAVData } from '@myfinance/core';

/** A non-throwing fake marketData with sensible empty defaults; override per test. */
export function fakeMarketData(overrides: Partial<MarketData> = {}): MarketData {
  return {
    searchSchemes: async (): Promise<SchemeInfo[]> => [],
    getLatestNAV: async (): Promise<number | null> => null,
    getNAVHistory: async (): Promise<NAVData[]> => [],
    ...overrides,
  };
}

/** Offline fund-data ingest stub; override per test. */
export function fakeFundData(overrides: Partial<FundData> = {}): FundData {
  return {
    ingest: async (amfiCode) => ({
      schemeId: 1,
      source: 'groww',
      asOfDate: '2026-08-31',
      holdingsCount: 2,
    }),
    ...overrides,
  };
}


/** Offline tier-C fetcher; override per test. */
export function fakeFundDetails(overrides: Partial<FundDetails> = {}): FundDetails {
  return {
    fetch: async () => ({
      fundamentals: { expenseRatioDirect: 0.5, expenseRatioRegular: null, planType: 'direct', aum: 1000, benchmarkName: 'Nifty 500 TRI',
        stdDev: null, sharpe: null, beta: null, alpha: null, source: 'groww' },
      holdings: [{ securityName: 'HDFC Bank', isin: null, weightPct: 8, sector: 'Financials', marketCapBucket: 'large' }],
      asOfDate: '2026-08-31',
      source: 'groww',
    }),
    ...overrides,
  };
}

export type SeedContextOpts = {
  fundDetails?: Partial<FundDetails>;
  marketData?: Partial<MarketData>;
  fundData?: Partial<FundData>;
};

/** Build an in-memory context with fake (offline) marketData + fundData. Caller calls ctx.close(). */
export function seedContext(opts: SeedContextOpts = {}): McpContext {
  return buildContext({
    dbPath: ':memory:',
    marketData: fakeMarketData(opts.marketData),
    fundData: fakeFundData(opts.fundData),
    fundDetails: fakeFundDetails(opts.fundDetails),
  });
}
