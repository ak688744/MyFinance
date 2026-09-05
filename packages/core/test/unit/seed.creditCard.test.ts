import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { seedDatabase } from '../../src/db/seed';
import { makeCategoryRepo } from '../../src/repositories/categoryRepo';

describe('seed credit_card_bill category', () => {
  it('seeds a credit_card_bill starter category', () => {
    const { db, sqlite } = runMigrations(':memory:');
    seedDatabase(db);
    const ids = makeCategoryRepo(db).list().map((c) => c.id);
    expect(ids).toContain('credit_card_bill');
    sqlite.close();
  });
});
