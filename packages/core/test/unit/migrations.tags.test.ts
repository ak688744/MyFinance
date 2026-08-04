import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('migration 0007 tags column', () => {
  it('transactions has a tags column after migration', () => {
    const { sqlite } = runMigrations(':memory:');
    const cols = sqlite.prepare(`PRAGMA table_info(transactions)`).all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('tags');
    sqlite.close();
  });
});
