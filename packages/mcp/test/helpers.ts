import { buildContext, type McpContext, type MarketData, type FundData } from '../src/context';
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

export type SeedContextOpts = {
  marketData?: Partial<MarketData>;
  fundData?: Partial<FundData>;
};

/** Build an in-memory context with fake (offline) marketData + fundData. Caller calls ctx.close(). */
export function seedContext(opts: SeedContextOpts = {}): McpContext {
  return buildContext({
    dbPath: ':memory:',
    marketData: fakeMarketData(opts.marketData),
    fundData: fakeFundData(opts.fundData),
  });
}
