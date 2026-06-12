import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeCategoryRuleRepo } from '../../src/repositories/categoryRuleRepo';
import type { Db } from '../../src/db/client';

let repo: ReturnType<typeof makeCategoryRuleRepo>;
let sqlite: SqliteDatabase;
let db: Db;

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  repo = makeCategoryRuleRepo(db);
  // category_rules.category_id -> categories.id (FK parent)
  sqlite
    .prepare(
      `INSERT INTO categories (id, name) VALUES ('food','Food'),('travel','Travel'),('bills','Bills')`,
    )
    .run();
});

function countRules(): number {
  const r = sqlite
    .prepare(`SELECT COUNT(*) as c FROM category_rules`)
    .get() as { c: number };
  return r.c;
}

function rawRule(id: number) {
  return sqlite
    .prepare(
      `SELECT id, rule_type, pattern_value, category_id, priority, is_active
       FROM category_rules WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        rule_type: string;
        pattern_value: string;
        category_id: string;
        priority: number;
        is_active: number;
      }
    | undefined;
}

describe('categoryRuleRepo.getActiveRules', () => {
  it('orders by priority DESC, id DESC and excludes inactive rules', () => {
    const a = repo.createRule({ ruleType: 'merchant', patternValue: 'starbucks', categoryId: 'food' }); // pri 200
    const b = repo.createRule({ ruleType: 'upi_note_keyword', patternValue: 'rent', categoryId: 'bills' }); // pri 100
    const c = repo.createRule({ ruleType: 'merchant', patternValue: 'amazon', categoryId: 'bills' }); // pri 200
    // an inactive rule must be excluded
    sqlite
      .prepare(
        `INSERT INTO category_rules (rule_type, pattern_value, category_id, priority, is_active)
         VALUES ('merchant','inactivepat','travel',200,0)`,
      )
      .run();

    const rules = repo.getActiveRules();
    expect(rules.map((r) => r.id)).toEqual([c, a, b]);
    expect(rules.every((r) => r.patternValue !== 'inactivepat')).toBe(true);
    expect(rules[0]).toEqual({
      id: c,
      ruleType: 'merchant',
      patternValue: 'amazon',
      categoryId: 'bills',
      priority: 200,
    });
  });
});

describe('categoryRuleRepo.createRule', () => {
  it('defaults priority: merchant=200', () => {
    const id = repo.createRule({ ruleType: 'merchant', patternValue: 'm1', categoryId: 'food' });
    expect(rawRule(id)?.priority).toBe(200);
  });

  it('defaults priority: upi_note_keyword=100', () => {
    const id = repo.createRule({ ruleType: 'upi_note_keyword', patternValue: 'u1', categoryId: 'food' });
    expect(rawRule(id)?.priority).toBe(100);
  });

  it('honors an explicit priority override', () => {
    const id = repo.createRule({ ruleType: 'merchant', patternValue: 'm2', categoryId: 'food', priority: 999 });
    expect(rawRule(id)?.priority).toBe(999);
  });

  it('persists createdFromTransactionId is optional (no crash when omitted)', () => {
    const id = repo.createRule({ ruleType: 'merchant', patternValue: 'm3', categoryId: 'food' });
    expect(typeof id).toBe('number');
  });

  it('upserts on (rule_type, pattern_value) — 2nd call UPDATES, no duplicate', () => {
    const id1 = repo.createRule({ ruleType: 'merchant', patternValue: 'dup', categoryId: 'food', priority: 200 });
    const id2 = repo.createRule({ ruleType: 'merchant', patternValue: 'dup', categoryId: 'travel', priority: 50 });
    expect(countRules()).toBe(1);
    expect(id2).toBe(id1);
    const row = rawRule(id1);
    expect(row?.category_id).toBe('travel');
    expect(row?.priority).toBe(50);
  });

  it('upsert resets is_active back to 1', () => {
    const id = repo.createRule({ ruleType: 'merchant', patternValue: 'reactivate', categoryId: 'food' });
    // deactivate it directly
    sqlite.prepare(`UPDATE category_rules SET is_active = 0 WHERE id = ?`).run(id);
    repo.createRule({ ruleType: 'merchant', patternValue: 'reactivate', categoryId: 'travel' });
    expect(rawRule(id)?.is_active).toBe(1);
  });
});

describe('categoryRuleRepo.updateRuleCategory', () => {
  it('updates category_id by id', () => {
    const id = repo.createRule({ ruleType: 'merchant', patternValue: 'upd', categoryId: 'food' });
    repo.updateRuleCategory(id, 'travel');
    expect(rawRule(id)?.category_id).toBe('travel');
  });

  it('also updates rule_type + priority when provided (faithful manageRules port)', () => {
    const id = repo.createRule({ ruleType: 'upi_note_keyword', patternValue: 'upd2', categoryId: 'food' });
    expect(rawRule(id)?.rule_type).toBe('upi_note_keyword');
    expect(rawRule(id)?.priority).toBe(100);
    repo.updateRuleCategory(id, 'travel', 'merchant', 200);
    const row = rawRule(id);
    expect(row?.category_id).toBe('travel');
    expect(row?.rule_type).toBe('merchant');
    expect(row?.priority).toBe(200);
  });
});

describe('categoryRuleRepo.deleteRule', () => {
  it('deletes by id', () => {
    const id = repo.createRule({ ruleType: 'merchant', patternValue: 'del', categoryId: 'food' });
    repo.deleteRule(id);
    expect(rawRule(id)).toBeUndefined();
    expect(countRules()).toBe(0);
  });
});
