import { describe, expect, it, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeCategoryRepo } from '../../src/repositories/categoryRepo';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';
import { makeCategoryRuleRepo } from '../../src/repositories/categoryRuleRepo';
import type { Db } from '../../src/db/client';
import type { Database as SqliteDatabase } from 'better-sqlite3';

describe('CategoryRepo CRUD', () => {
  let db: Db;
  let sqlite: SqliteDatabase;
  let categoryRepo: ReturnType<typeof makeCategoryRepo>;
  let expenseTxRepo: ReturnType<typeof makeExpenseTransactionRepo>;
  let categoryRuleRepo: ReturnType<typeof makeCategoryRuleRepo>;

  beforeEach(() => {
    const result = runMigrations(':memory:');
    db = result.db;
    sqlite = result.sqlite;
    categoryRepo = makeCategoryRepo(db);
    expenseTxRepo = makeExpenseTransactionRepo(db);
    categoryRuleRepo = makeCategoryRuleRepo(db);
  });

  it('create() inserts a category; list() includes it; exists() true', () => {
    categoryRepo.create({ id: 'travel', name: 'Travel', icon: '✈️' });

    const categories = categoryRepo.list();
    expect(categories.some(c => c.id === 'travel' && c.name === 'Travel')).toBe(true);
    expect(categoryRepo.exists('travel')).toBe(true);
  });

  it('exists() false for unknown id', () => {
    expect(categoryRepo.exists('nonexistent')).toBe(false);
  });

  it('rename() changes the name (id unchanged)', () => {
    categoryRepo.create({ id: 'travel', name: 'Travel', icon: '✈️' });
    categoryRepo.rename('travel', 'Trips');

    const categories = categoryRepo.list();
    const travelCat = categories.find(c => c.id === 'travel');
    expect(travelCat?.name).toBe('Trips');
  });

  it('delete() on a category with a tagged transaction sets that transaction\'s category_id to NULL and removes the category; the transaction row still exists', () => {
    // Create a category
    categoryRepo.create({ id: 'testcat', name: 'Test Category' });

    // Insert a transaction with that category via raw SQL
    const insertTxn = sqlite.prepare(`
      INSERT INTO transactions (
        transaction_date, description, normalized_description, amount, direction,
        category_id, source_type, dedupe_key, account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertTxn.run(
      '2026-01-01', 'Test transaction', 'test transaction', 100, 'debit',
      'testcat', 'manual', 'test-dedupe-1', null
    );

    // Verify transaction has the category
    const beforeQuery = sqlite.prepare('SELECT category_id FROM transactions WHERE dedupe_key = ?');
    const before = beforeQuery.get('test-dedupe-1') as { category_id: string | null };
    expect(before.category_id).toBe('testcat');

    // Delete the category
    categoryRepo.delete('testcat');

    // Verify transaction's category_id is now NULL
    const afterQuery = sqlite.prepare('SELECT id, category_id FROM transactions WHERE dedupe_key = ?');
    const after = afterQuery.get('test-dedupe-1') as { id: number; category_id: string | null };
    expect(after).toBeDefined();
    expect(after.category_id).toBeNull();

    // Verify category is gone
    expect(categoryRepo.exists('testcat')).toBe(false);
  });

  it('delete() also removes any category_rules rows that referenced the deleted category id', () => {
    // Create a category
    categoryRepo.create({ id: 'testcat', name: 'Test Category' });

    // Create a rule pointing to this category
    const ruleId = categoryRuleRepo.createRule({
      ruleType: 'merchant',
      patternValue: 'test-merchant',
      categoryId: 'testcat',
      priority: 100,
    });

    // Verify rule exists
    const rulesBefore = categoryRuleRepo.getActiveRules();
    expect(rulesBefore.some(r => r.id === ruleId)).toBe(true);

    // Delete the category
    categoryRepo.delete('testcat');

    // Verify rule is gone
    const rulesAfter = categoryRuleRepo.getActiveRules();
    expect(rulesAfter.some(r => r.id === ruleId)).toBe(false);

    // Verify category is gone
    expect(categoryRepo.exists('testcat')).toBe(false);
  });
});
