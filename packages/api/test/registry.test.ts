import { describe, it, expect } from 'vitest';
import { resolveParser } from '../src/import/registry';
import {
  parseHdfcStatementXls,
  parseGrowwHoldingsXls,
  parseGrowwTransactionXls,
} from '@myfinance/core';

describe('resolveParser', () => {
  it('resolves known (platform, kind) pairs to the core parsers', () => {
    expect(resolveParser('hdfc', 'expense')).toBe(parseHdfcStatementXls);
    expect(resolveParser('groww', 'holdings')).toBe(parseGrowwHoldingsXls);
    expect(resolveParser('groww', 'transactions')).toBe(parseGrowwTransactionXls);
  });

  it('is case-insensitive on platform', () => {
    expect(resolveParser('GROWW', 'holdings')).toBe(parseGrowwHoldingsXls);
  });

  it('throws statusCode-400 for an unsupported pair', () => {
    try {
      resolveParser('etmoney', 'holdings');
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/unsupported/i);
    }
  });
});
