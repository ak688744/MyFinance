import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('scheme_fundamentals + scheme_holdings migration', () => {
  it('creates both tables', () => {
    const { sqlite } = runMigrations(':memory:');
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('scheme_fundamentals','scheme_holdings')")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name).sort()).toEqual(['scheme_fundamentals', 'scheme_holdings']);
    sqlite.close();
  });
});
