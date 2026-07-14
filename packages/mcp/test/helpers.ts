import { buildContext, type McpContext, type MarketData } from '../src/context';
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

/** Build an in-memory context with a fake (offline) marketData. Caller calls ctx.close(). */
export function seedContext(overrides: Partial<MarketData> = {}): McpContext {
  return buildContext({ dbPath: ':memory:', marketData: fakeMarketData(overrides) });
}
