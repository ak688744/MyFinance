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

function seedWithInvestments(sqlite: ReturnType<typeof runMigrations>['sqlite']) {
  for (const [id, name] of [['food', 'Food'], ['salary', 'Salary'], ['investment', 'Investment'], ['transfer', 'Transfer']]) {
    sqlite.prepare(`INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?,?,?)`).run(id, name, null);
  }
  const ins = sqlite.prepare(
    `INSERT INTO transactions
      (transaction_date, description, normalized_description, amount, direction,
       category_id, category_source, source_type, dedupe_key)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  ins.run('2025-01-10', 'SWIGGY', 'swiggy', 1000, 'debit', 'food', 'manual', 'hdfc', 'e1');
  ins.run('2025-01-15', 'SIP', 'sip', 5000, 'debit', 'investment', 'manual', 'hdfc', 'e2');
  ins.run('2025-01-16', 'SELF TRANSFER', 'self transfer', 2000, 'debit', 'transfer', 'manual', 'hdfc', 'e3');
  ins.run('2025-01-20', 'UNCATEGORIZED', 'uncat', 500, 'debit', null, null, 'hdfc', 'e4');
  ins.run('2025-01-01', 'ACME SALARY', 'acme salary', 50000, 'credit', 'salary', 'manual', 'hdfc', 'e5');
  ins.run('2025-01-02', 'TRANSFER IN', 'transfer in', 3000, 'credit', 'transfer', 'manual', 'hdfc', 'e6');
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

  it('defaults invested to 0 and excludes nothing when no exclude params given', () => {
    const s = repo.summary();
    expect(s.invested).toBe(0);
  });
});

describe('ExpenseTransactionRepo.summary with excludeFromSpend/investmentCategories', () => {
  let repo: ReturnType<typeof makeExpenseTransactionRepo>;

  beforeEach(() => {
    const { db, sqlite } = runMigrations(':memory:');
    seedWithInvestments(sqlite);
    repo = makeExpenseTransactionRepo(db);
  });

  it('excludes investment + transfer from spend and reports invested separately', () => {
    const s = repo.summary({
      excludeFromSpend: ['investment', 'transfer'],
      investmentCategories: ['investment'],
    });
    // debits: food 1000 + sip 5000 (excl) + transfer 2000 (excl) + uncat 500
    expect(s.totalSpent).toBe(1500); // 1000 + 500
    expect(s.invested).toBe(5000);
    // income credits: salary 50000 + transfer-in 3000 (excl) => 50000
    expect(s.totalIncome).toBe(50000);
    // saved = income - spent = 50000 - 1500
    expect(s.saved).toBe(48500);
  });

  it('excludes those categories from byCategory and byMonth spend breakdown', () => {
    const s = repo.summary({
      excludeFromSpend: ['investment', 'transfer'],
      investmentCategories: ['investment'],
    });
    expect(s.byCategory.find((c) => c.categoryId === 'investment')).toBeUndefined();
    expect(s.byCategory.find((c) => c.categoryId === 'transfer')).toBeUndefined();
    const jan = s.byMonth.find((m) => m.month === '2025-01');
    expect(jan?.spent).toBe(1500); // investment + transfer removed
  });

  it('treats uncategorized (null) debits as spend, never excluded', () => {
    const s = repo.summary({ excludeFromSpend: ['investment', 'transfer'], investmentCategories: ['investment'] });
    expect(s.byCategory.find((c) => c.categoryId === null)?.amount).toBe(500);
  });
});

describe('ExpenseTransactionRepo.listUncategorizedInRange', () => {
  let repo: ReturnType<typeof makeExpenseTransactionRepo>;
  let sqlite: ReturnType<typeof runMigrations>['sqlite'];

  beforeEach(() => {
    const { db, sqlite: s } = runMigrations(':memory:');
    sqlite = s;
    repo = makeExpenseTransactionRepo(db);
  });

  it('listUncategorizedInRange returns only null-category txns within the date window', () => {
    sqlite.prepare(`INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?,?,?)`).run('food', 'Food', null);
    const ins = sqlite.prepare(
      `INSERT INTO transactions
        (transaction_date, description, normalized_description, amount, direction,
         category_id, category_source, source_type, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    ins.run('2026-03-05', 'UNCAT MARCH', 'uncat march', 100, 'debit', null, null, 'hdfc', 'uc1');
    ins.run('2026-03-20', 'FOOD MARCH', 'food march', 200, 'debit', 'food', 'manual', 'hdfc', 'uc2');
    ins.run('2026-02-25', 'UNCAT FEB', 'uncat feb', 150, 'debit', null, null, 'hdfc', 'uc3');

    const rows = repo.listUncategorizedInRange({ from: '2026-03-01', to: '2026-03-31' });
    expect(rows.map((r) => r.description)).toEqual(['UNCAT MARCH']);
    expect(rows[0]).toMatchObject({ direction: 'debit', amount: 100 });
  });

  it('query() exposes categorySource', () => {
    sqlite.prepare(`INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?,?,?)`).run('food', 'Food', null);
    const ins = sqlite.prepare(
      `INSERT INTO transactions
        (transaction_date, description, normalized_description, amount, direction,
         category_id, category_source, source_type, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    ins.run('2026-03-05', 'TEST', 'test', 100, 'debit', 'food', 'manual', 'hdfc', 'cs1');

    const rows = repo.query({ from: '2026-03-01', to: '2026-03-31' });
    expect(rows[0]).toHaveProperty('categorySource');
    expect(rows[0].categorySource).toBe('manual');
  });
});
