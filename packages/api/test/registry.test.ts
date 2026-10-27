import { describe, it, expect } from 'vitest';
import { resolveParser } from '../src/import/registry';
import { parseHdfcStatementXls } from '@myfinance/core';

function statusOf(fn: () => unknown): { statusCode?: number; message: string } {
  try {
    fn();
  } catch (e) {
    return e as Error & { statusCode?: number };
  }
  throw new Error('should have thrown');
}

describe('resolveParser', () => {
  it('resolves hdfc expense to the core parser (case-insensitive platform)', () => {
    expect(resolveParser('hdfc', 'expense')).toBe(parseHdfcStatementXls);
    expect(resolveParser('HDFC', 'expense')).toBe(parseHdfcStatementXls);
  });

  it('groww holdings/transactions are unlinked: throws statusCode-400', () => {
    for (const kind of ['holdings', 'transactions'] as const) {
      const err = statusOf(() => resolveParser('groww', kind));
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/unsupported/i);
    }
  });

  it('throws statusCode-400 for an unsupported pair', () => {
    const err = statusOf(() => resolveParser('etmoney', 'holdings'));
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/unsupported/i);
  });
});
