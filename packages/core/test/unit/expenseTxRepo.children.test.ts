import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';
import { categories } from '../../src/db/schema';

function setup() {
  const { db, sqlite } = runMigrations(':memory:');
  db.insert(categories).values([
    { id: 'food', name: 'Food' },
    { id: 'shopping', name: 'Shopping' },
  ]).run();
  const repo = makeExpenseTransactionRepo(db);
  return { repo, sqlite };
}

describe('expenseTxRepo children (split)', () => {
  it('inserts children linked to a parent and lists them', () => {
    const { repo, sqlite } = setup();
    const parentId = repo.insertManual({
      transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT',
      amount: 8000, direction: 'debit',
    });
    const c1 = repo.insertChild(parentId, {
      transactionDate: '2026-06-02', description: 'SWIGGY', amount: 500,
      direction: 'debit', categoryId: 'food', categorySource: 'manual', accountId: null,
    });
    const c2 = repo.insertChild(parentId, {
      transactionDate: '2026-06-05', description: 'REFUND AMAZON', amount: 200,
      direction: 'credit', categoryId: 'shopping', categorySource: 'manual', accountId: null,
    });
    expect(c1).toBeGreaterThan(0);
    expect(c2).toBeGreaterThan(0);

    const kids = repo.listChildren(parentId);
    expect(kids.map((k) => k.id).sort()).toEqual([c1, c2].sort());
    expect(kids.every((k) => k.parentTransactionId === parentId)).toBe(true);

    const page = repo.query({ from: '2026-06-01', to: '2026-06-30' });
    const parent = page.find((r) => r.id === parentId)!;
    expect(parent.parentTransactionId).toBeNull();

    const filtered = repo.query({ parentId });
    expect(filtered.map((r) => r.id).sort()).toEqual([c1, c2].sort());
    sqlite.close();
  });

  it('gives each child a unique dedupe key (no collision)', () => {
    const { repo, sqlite } = setup();
    const parentId = repo.insertManual({ transactionDate: '2026-06-15', description: 'CC', amount: 100, direction: 'debit' });
    const a = repo.insertChild(parentId, { transactionDate: '2026-06-02', description: 'X', amount: 50, direction: 'debit', categoryId: null, categorySource: null, accountId: null });
    const b = repo.insertChild(parentId, { transactionDate: '2026-06-02', description: 'X', amount: 50, direction: 'debit', categoryId: null, categorySource: null, accountId: null });
    expect(a).not.toEqual(b);
    expect(repo.listChildren(parentId).length).toBe(2);
    sqlite.close();
  });

  it('getFullById returns amount and accountId', () => {
    const { repo, sqlite } = setup();
    const parentId = repo.insertManual({ transactionDate: '2026-06-15', description: 'CC', amount: 8000, direction: 'debit' });
    const full = repo.getFullById(parentId);
    expect(full?.amount).toBe(8000);
    expect(full?.accountId).toBeNull();
    sqlite.close();
  });
});
