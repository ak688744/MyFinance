import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';

function seedTxn(repo: ReturnType<typeof makeExpenseTransactionRepo>) {
  return repo.insertManual({ transactionDate: '2026-08-01', description: 'ACME', amount: 100, direction: 'debit' });
}

describe('ExpenseTransactionRepo tags', () => {
  let repo: ReturnType<typeof makeExpenseTransactionRepo>;
  beforeEach(() => {
    const { db } = runMigrations(':memory:');
    repo = makeExpenseTransactionRepo(db);
  });

  it('getTags empty by default; setTags then getTags round-trips normalized', () => {
    const id = seedTxn(repo);
    expect(repo.getTags(id)).toEqual([]);
    repo.setTags(id, [{ tag: 'Subscription', source: 'user' }]);
    expect(repo.getTags(id)).toEqual([{ tag: 'subscription', source: 'user' }]);
  });

  it('addTags merges (incoming source wins); removeTag drops one; empty persists as null', () => {
    const id = seedTxn(repo);
    repo.setTags(id, [{ tag: 'work', source: 'user' }]);
    repo.addTags(id, [{ tag: 'WORK', source: 'agent' }, { tag: 'recurring', source: 'agent' }]);
    expect(repo.getTags(id)).toEqual([
      { tag: 'work', source: 'agent' },
      { tag: 'recurring', source: 'agent' },
    ]);
    repo.removeTag(id, 'work');
    expect(repo.getTags(id)).toEqual([{ tag: 'recurring', source: 'agent' }]);
    repo.removeTag(id, 'recurring');
    expect(repo.getTags(id)).toEqual([]);
  });

  it('query() returns parsed tags on each row', () => {
    const id = seedTxn(repo);
    repo.setTags(id, [{ tag: 'subscription', source: 'agent' }]);
    const rows = repo.query({});
    expect(rows.find((r) => r.id === id)?.tags).toEqual([{ tag: 'subscription', source: 'agent' }]);
  });
});
