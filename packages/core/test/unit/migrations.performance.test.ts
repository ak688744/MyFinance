import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('migration 0011 performance universe', () => {
  it('creates the six performance tables', () => {
    const { sqlite } = runMigrations(':memory:');
    const names = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[])
      .map((r) => r.name);
    for (const t of ['fund_universe', 'fund_monthly_nav', 'fund_performance', 'category_stats', 'investment_review_cache', 'candidate_details']) {
      expect(names).toContain(t);
    }
    sqlite.close();
  });
});
