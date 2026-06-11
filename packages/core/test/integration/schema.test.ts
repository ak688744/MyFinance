import { describe, it, expect } from 'vitest';
import * as schema from '../../src/db/schema';

describe('schema', () => {
  it('defines all 8 tables', () => {
    for (const t of [
      'categories', 'importHistory', 'transactions', 'categoryRules',
      'investmentSchemes', 'investmentImportHistory', 'investmentHoldings',
      'investmentTransactions',
    ]) {
      expect(schema[t as keyof typeof schema]).toBeDefined();
    }
  });
});
