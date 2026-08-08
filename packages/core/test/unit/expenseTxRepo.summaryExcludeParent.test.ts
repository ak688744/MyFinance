import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';
import { categories } from '../../src/db/schema';

function seedCategories(db: ReturnType<typeof runMigrations>['db']) {
  db.insert(categories).values([
    { id: 'food', name: 'Food' },
    { id: 'shopping', name: 'Shopping' },
  ]).run();
}

describe('summary excludes split parents', () => {
  it('counts children, not the parent bill, in totalSpent', () => {
    const { db, sqlite } = runMigrations(':memory:');
    seedCategories(db);
    const repo = makeExpenseTransactionRepo(db);
    const parentId = repo.insertManual({
      transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT',
      amount: 8000, direction: 'debit',
    });
    repo.insertChild(parentId, { transactionDate: '2026-06-02', description: 'SWIGGY', amount: 500, direction: 'debit', categoryId: 'food', categorySource: 'manual', accountId: null });
    repo.insertChild(parentId, { transactionDate: '2026-06-05', description: 'AMAZON', amount: 1500, direction: 'debit', categoryId: 'shopping', categorySource: 'manual', accountId: null });

    const s = repo.summary({ from: '2026-06-01', to: '2026-06-30' });
    expect(s.totalSpent).toBe(2000);
    const catIds = s.byCategory.map((c) => c.categoryId);
    expect(catIds).toContain('food');
    expect(catIds).toContain('shopping');
    sqlite.close();
  });

  it('leaves an unsplit bill in totals', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeExpenseTransactionRepo(db);
    repo.insertManual({ transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT', amount: 8000, direction: 'debit' });
    const s = repo.summary({ from: '2026-06-01', to: '2026-06-30' });
    expect(s.totalSpent).toBe(8000);
    sqlite.close();
  });
});
