import { describe, it, expect } from 'vitest';
import { createDb } from '../../src/db/client';

describe('createDb', () => {
  it('opens an in-memory database', () => {
    const { db, sqlite } = createDb(':memory:');
    expect(db).toBeDefined();
    const row = sqlite.prepare('SELECT 1 AS one').get() as { one: number };
    expect(row.one).toBe(1);
    sqlite.close();
  });
});
