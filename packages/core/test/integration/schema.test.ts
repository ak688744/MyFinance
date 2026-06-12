import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
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

  it('emits SQL CHECK constraints for enum columns', () => {
    const cases: Array<[keyof typeof schema, string]> = [
      ['transactions', 'transactions_direction_check'],
      ['categoryRules', 'category_rules_rule_type_check'],
      ['investmentSchemes', 'investment_schemes_category_check'],
      ['investmentImportHistory', 'investment_import_history_import_type_check'],
      ['investmentTransactions', 'investment_transactions_transaction_type_check'],
    ];

    for (const [tableKey, checkName] of cases) {
      const checks = getTableConfig(
        schema[tableKey] as Parameters<typeof getTableConfig>[0],
      ).checks;
      expect(checks.length).toBeGreaterThanOrEqual(1);
      expect(checks.map((c) => c.name)).toContain(checkName);
    }
  });
});
