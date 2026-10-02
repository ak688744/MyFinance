import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';

function setup() {
  const { db, sqlite } = runMigrations(':memory:');
  const repo = makeExpenseTransactionRepo(db);
  let n = 0;
  const add = (date: string, dir: 'debit' | 'credit', amount: number, balance: number | null, parent: number | null = null) => {
    n += 1;
    const r = sqlite.prepare(
      `INSERT INTO transactions (transaction_date, description, normalized_description, amount, direction,
         source_type, dedupe_key, balance, parent_transaction_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(date, `T${n}`, `t${n}`, amount, dir, 'hdfc', `k${n}`, balance, parent);
    return Number(r.lastInsertRowid);
  };
  return { repo, add };
}

describe('expenseTxRepo.balanceRange', () => {
  it('returns null for an empty window', () => {
    const { repo } = setup();
    expect(repo.balanceRange({})).toBeNull();
  });

  it('derives opening from a first debit, closing from last', () => {
    const { repo, add } = setup();
    add('2026-06-01', 'debit', 100, 900);
    add('2026-06-10', 'credit', 500, 1400);
    expect(repo.balanceRange({})).toEqual({ opening: 1000, closing: 1400 });
  });

  it('derives opening from a first credit', () => {
    const { repo, add } = setup();
    add('2026-06-01', 'credit', 200, 1200);
    add('2026-06-02', 'debit', 50, 1150);
    expect(repo.balanceRange({})).toEqual({ opening: 1000, closing: 1150 });
  });

  it('orders same-date rows by id', () => {
    const { repo, add } = setup();
    add('2026-06-01', 'debit', 100, 900);
    add('2026-06-01', 'debit', 100, 800);
    expect(repo.balanceRange({})).toEqual({ opening: 1000, closing: 800 });
  });

  it('ignores null-balance rows and children', () => {
    const { repo, add } = setup();
    add('2026-06-01', 'debit', 10, null);
    const p = add('2026-06-02', 'debit', 100, 900);
    add('2026-06-03', 'debit', 5, 123456, p);
    add('2026-06-04', 'debit', 7, null);
    expect(repo.balanceRange({})).toEqual({ opening: 1000, closing: 900 });
  });

  it('respects from/to bounds inclusively', () => {
    const { repo, add } = setup();
    add('2026-05-31', 'debit', 100, 900);
    add('2026-06-01', 'debit', 100, 800);
    add('2026-06-30', 'debit', 100, 700);
    add('2026-07-01', 'debit', 100, 600);
    expect(repo.balanceRange({ from: '2026-06-01', to: '2026-06-30' })).toEqual({ opening: 900, closing: 700 });
    expect(repo.balanceRange({ from: '2026-08-01' })).toBeNull();
  });
});
