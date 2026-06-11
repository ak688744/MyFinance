import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('runMigrations', () => {
  it('creates all 8 tables', () => {
    const { sqlite } = runMigrations(':memory:');
    const names = (
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    for (const t of [
      'categories',
      'import_history',
      'transactions',
      'category_rules',
      'investment_schemes',
      'investment_import_history',
      'investment_holdings',
      'investment_transactions',
    ]) {
      expect(names).toContain(t);
    }
    sqlite.close();
  });
});
