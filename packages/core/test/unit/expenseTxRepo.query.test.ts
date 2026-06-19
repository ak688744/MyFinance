import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';

function seed(sqlite: ReturnType<typeof runMigrations>['sqlite']) {
  sqlite.prepare(`INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?,?,?)`).run('food', 'Food', null);
  sqlite.prepare(`INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?,?,?)`).run('salary', 'Salary', null);
  const ins = sqlite.prepare(
    `INSERT INTO transactions
      (transaction_date, description, normalized_description, amount, direction,
       category_id, category_source, source_type, dedupe_key)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  ins.run('2025-01-10', 'SWIGGY', 'swiggy', 450, 'debit', 'food', 'manual', 'hdfc', 'd1');
  ins.run('2025-01-20', 'ZOMATO', 'zomato', 550, 'debit', 'food', 'manual', 'hdfc', 'd2');
  ins.run('2025-02-01', 'ACME SALARY', 'acme salary', 100000, 'credit', 'salary', 'manual', 'hdfc', 'd3');
  ins.run('2025-02-05', 'UBER', 'uber', 300, 'debit', null, null, 'hdfc', 'd4');
}

describe('ExpenseTransactionRepo.query', () => {
  let repo: ReturnType<typeof makeExpenseTransactionRepo>;
  let sqlite: ReturnType<typeof runMigrations>['sqlite'];

  beforeEach(() => {
    const { db, sqlite: s } = runMigrations(':memory:');
    sqlite = s;
    seed(sqlite);
    repo = makeExpenseTransactionRepo(db);
  });

  it('returns all rows newest-first with no filters', () => {
    const rows = repo.query();
    expect(rows.map((r) => r.description)).toEqual(['UBER', 'ACME SALARY', 'ZOMATO', 'SWIGGY']);
  });

  it('filters by date window inclusive', () => {
    const rows = repo.query({ from: '2025-01-01', to: '2025-01-31' });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.transactionDate.startsWith('2025-01'))).toBe(true);
  });

  it('filters by direction (out => debit)', () => {
    expect(repo.query({ direction: 'out' })).toHaveLength(3);
    expect(repo.query({ direction: 'in' })).toHaveLength(1);
  });

  it('search is case-insensitive over description', () => {
    expect(repo.query({ search: 'swig' })).toHaveLength(1);
  });

  it('filters by categoryId and paginates', () => {
    expect(repo.query({ categoryId: 'food' })).toHaveLength(2);
    expect(repo.query({ limit: 1, offset: 1 })).toHaveLength(1);
  });
});

describe('ExpenseTransactionRepo.summary', () => {
  let repo: ReturnType<typeof makeExpenseTransactionRepo>;

  beforeEach(() => {
    const { db, sqlite } = runMigrations(':memory:');
    seed(sqlite);
    repo = makeExpenseTransactionRepo(db);
  });

  it('computes totals, saved, byCategory and byMonth', () => {
    const s = repo.summary();
    expect(s.totalSpent).toBe(1300);
    expect(s.totalIncome).toBe(100000);
    expect(s.saved).toBe(98700);
    const food = s.byCategory.find((c) => c.categoryId === 'food');
    expect(food?.amount).toBe(1000);
    const jan = s.byMonth.find((m) => m.month === '2025-01');
    expect(jan?.spent).toBe(1000);
    const feb = s.byMonth.find((m) => m.month === '2025-02');
    expect(feb?.spent).toBe(300);
  });

  it('respects the date window', () => {
    const s = repo.summary({ from: '2025-02-01', to: '2025-02-28' });
    expect(s.totalSpent).toBe(300);
    expect(s.totalIncome).toBe(100000);
  });
});
