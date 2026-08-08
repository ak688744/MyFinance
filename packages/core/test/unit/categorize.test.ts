import { describe, it, expect } from 'vitest';
import {
  extractMerchantKey,
  extractUpiNoteKeyword,
  createCategorizationInput,
  resolveCategoryFromRules,
  recategorizeNonManualTransactions,
  saveCategoryMemoryRule,
  createRule,
  updateRuleCategory,
  deleteRule,
} from '../../src/domain/categorize';
import type {
  StoredCategoryRule,
  CategoryRuleRepo,
  ExpenseTransactionRepo,
} from '../../src/repositories/types';

// ---------------------------------------------------------------------------
// Pure matching functions
// ---------------------------------------------------------------------------

describe('extractMerchantKey', () => {
  it('extracts the merchant segment from a UPI description', () => {
    expect(extractMerchantKey('UPI-Zepto Marketplace-zepto@ybl-12345-payment')).toBe(
      'zepto marketplace',
    );
  });
  it('returns null when the merchant segment is not useful (masked)', () => {
    expect(extractMerchantKey('UPI-xxxx1234-foo@ybl-1-payment')).toBeNull();
  });
  it('extracts from an ACH description', () => {
    expect(extractMerchantKey('ACH D- NETFLIX ENTERTAINMENT-12345')).toBe(
      'netflix entertainment',
    );
  });
  it('returns null for a non-UPI/ACH/POS description', () => {
    expect(extractMerchantKey('SOME RANDOM TXN')).toBeNull();
  });
});

describe('extractUpiNoteKeyword', () => {
  it('returns the last useful note segment', () => {
    expect(extractUpiNoteKeyword('UPI-John Doe-john@ybl-12345-netflix bill')).toBe(
      'netflix bill',
    );
  });
  it('skips generic notes like "payment" and scans back for a useful segment', () => {
    // "payment" is generic, "12345" has no letters, "john@ybl" -> "john ybl".
    expect(extractUpiNoteKeyword('UPI-John Doe-john@ybl-12345-payment')).toBe(
      'john ybl',
    );
  });
  it('returns null for non-UPI descriptions', () => {
    expect(extractUpiNoteKeyword('ACH D- NETFLIX-1')).toBeNull();
  });
});

describe('createCategorizationInput', () => {
  it('assembles description + merchantKey + upiNoteKeyword', () => {
    const input = createCategorizationInput(
      'UPI-Zepto Marketplace-zepto@ybl-12345-grocery order',
    );
    expect(input.description).toBe(
      'UPI-Zepto Marketplace-zepto@ybl-12345-grocery order',
    );
    expect(input.merchantKey).toBe('zepto marketplace');
    expect(input.upiNoteKeyword).toBe('grocery order');
  });
});

describe('resolveCategoryFromRules — precedence', () => {
  const merchantRule: StoredCategoryRule = {
    id: 1,
    ruleType: 'merchant',
    patternValue: 'zepto marketplace',
    categoryId: 'shopping',
    priority: 200,
  };
  const upiRule: StoredCategoryRule = {
    id: 2,
    ruleType: 'upi_note_keyword',
    patternValue: 'grocery order',
    categoryId: 'food',
    priority: 100,
  };

  it('merchant rule beats upi_note_keyword rule beats builtin', () => {
    const input = createCategorizationInput(
      'UPI-Zepto Marketplace-zepto@ybl-12345-grocery order',
    );
    // builtin would say 'groceries' (zepto); rules win.
    const r = resolveCategoryFromRules(input, [merchantRule, upiRule]);
    expect(r).toEqual({ categoryId: 'shopping', categorySource: 'merchant_rule' });
  });

  it('upi_note_keyword rule wins when no merchant rule matches', () => {
    const input = createCategorizationInput(
      'UPI-Zepto Marketplace-zepto@ybl-12345-grocery order',
    );
    const r = resolveCategoryFromRules(input, [upiRule]);
    expect(r).toEqual({ categoryId: 'food', categorySource: 'upi_note_keyword' });
  });

  it('falls back to builtin rule when no stored rule matches', () => {
    const input = createCategorizationInput('PAYMENT TO netflix india');
    const r = resolveCategoryFromRules(input, []);
    expect(r).toEqual({ categoryId: 'bills', categorySource: 'builtin_rule' });
  });

  it('builtin: zepto -> groceries', () => {
    const input = createCategorizationInput('payment at zepto store');
    const r = resolveCategoryFromRules(input, []);
    expect(r).toEqual({ categoryId: 'groceries', categorySource: 'builtin_rule' });
  });

  it('returns null when nothing matches', () => {
    const input = createCategorizationInput('totally unknown vendor xyz');
    const r = resolveCategoryFromRules(input, []);
    expect(r).toEqual({ categoryId: null, categorySource: null });
  });
});

describe('keyword (substring) rule type', () => {
  const keywordRule = (patternValue: string, categoryId: string): StoredCategoryRule => ({
    id: 1, ruleType: 'keyword', patternValue, categoryId, priority: 50,
  });

  it('matches when the normalized description CONTAINS the keyword (plain description)', () => {
    const input = createCategorizationInput('SWIGGY ORDER 123');
    const res = resolveCategoryFromRules(input, [keywordRule('swiggy', 'food')]);
    expect(res).toEqual({ categoryId: 'food', categorySource: 'keyword_rule' });
  });

  it('does not match when the keyword is absent from the description', () => {
    const input = createCategorizationInput('AMAZON PURCHASE');
    const res = resolveCategoryFromRules(input, [keywordRule('swiggy', 'food')]);
    expect(res).toEqual({ categoryId: null, categorySource: null });
  });

  it('builtin_rule beats a keyword rule (keyword is below builtins)', () => {
    // "zepto" is a builtin groceries match; a keyword rule mapping "zepto"→food must NOT win.
    const input = createCategorizationInput('UPI PAYMENT ZEPTO STORE');
    const res = resolveCategoryFromRules(input, [
      { id: 1, ruleType: 'keyword', patternValue: 'zepto', categoryId: 'food', priority: 50 },
    ]);
    expect(res).toEqual({ categoryId: 'groceries', categorySource: 'builtin_rule' });
  });

  it('an exact merchant rule beats a keyword rule', () => {
    const input = createCategorizationInput('UPI-SWIGGY-payment');
    const res = resolveCategoryFromRules(input, [
      { id: 1, ruleType: 'merchant', patternValue: 'swiggy', categoryId: 'food', priority: 200 },
      { id: 2, ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'shopping', priority: 50 },
    ]);
    expect(res.categorySource).toBe('merchant_rule');
    expect(res.categoryId).toBe('food');
  });
});

// ---------------------------------------------------------------------------
// Repo-injected orchestration (fake in-memory repos)
// ---------------------------------------------------------------------------

type FakeRule = StoredCategoryRule & { isActive: number };

function makeFakeRuleRepo(seed: StoredCategoryRule[] = []) {
  const rules: FakeRule[] = seed.map((r) => ({ ...r, isActive: 1 }));
  let nextId = Math.max(0, ...rules.map((r) => r.id)) + 1;
  const calls = { createRule: [] as any[], updateRuleCategory: [] as any[], deleteRule: [] as number[] };
  const repo: CategoryRuleRepo = {
    getActiveRules() {
      return rules
        .filter((r) => r.isActive === 1)
        .map(({ isActive, ...r }) => r)
        .sort((a, b) => b.priority - a.priority || b.id - a.id);
    },
    createRule(r) {
      calls.createRule.push(r);
      const existing = rules.find(
        (x) => x.ruleType === r.ruleType && x.patternValue === r.patternValue,
      );
      if (existing) {
        existing.categoryId = r.categoryId;
        existing.priority = r.priority ?? existing.priority;
        existing.isActive = 1;
        return existing.id;
      }
      const id = nextId++;
      rules.push({
        id,
        ruleType: r.ruleType,
        patternValue: r.patternValue,
        categoryId: r.categoryId,
        priority: r.priority ?? (r.ruleType === 'merchant' ? 200 : 100),
        isActive: 1,
      });
      return id;
    },
    updateRuleCategory(ruleId, categoryId, ruleType?, priority?) {
      calls.updateRuleCategory.push({ ruleId, categoryId, ruleType, priority });
      const rule = rules.find((x) => x.id === ruleId);
      if (rule) {
        rule.categoryId = categoryId;
        if (ruleType !== undefined) rule.ruleType = ruleType;
        if (priority !== undefined) rule.priority = priority;
      }
    },
    deleteRule(ruleId) {
      calls.deleteRule.push(ruleId);
      const i = rules.findIndex((x) => x.id === ruleId);
      if (i >= 0) rules.splice(i, 1);
    },
  };
  return { repo, rules, calls };
}

function makeFakeTxRepo(
  seed: { id: number; description: string; categorySource: string | null }[] = [],
) {
  const txns = seed.map((t) => ({
    ...t,
    categoryId: null as string | null,
  }));
  const updates: { id: number; categoryId: string | null; categorySource: string | null }[] = [];
  const repo: ExpenseTransactionRepo = {
    list() {
      return txns;
    },
    getNonManualForRecategorization() {
      return txns
        .filter((t) => t.categorySource === null || t.categorySource !== 'manual')
        .map((t) => ({
          id: t.id,
          description: t.description,
          merchantKey: null,
          upiNoteKeyword: null,
        }));
    },
    updateCategory(id, categoryId, categorySource) {
      updates.push({ id, categoryId, categorySource });
      const t = txns.find((x) => x.id === id);
      if (t) {
        t.categoryId = categoryId;
        t.categorySource = categorySource;
      }
    },
    getById(id) {
      const t = txns.find((x) => x.id === id);
      return t ? { id: t.id, description: t.description } : null;
    },
    insertIgnore() {
      throw new Error('not used');
    },
    updateAccount() {
      throw new Error('not used');
    },
    query() {
      throw new Error('not used');
    },
    summary() {
      throw new Error('not used');
    },
    listUncategorizedInRange() {
      throw new Error('not used');
    },
    updateAmount() {
      throw new Error('not used');
    },
    updateNote() {
      throw new Error('not used');
    },
    deleteTransaction() {
      throw new Error('not used');
    },
    insertManual() {
      throw new Error('not used');
    },
    insertChild() {
      throw new Error('not used');
    },
    listChildren() {
      throw new Error('not used');
    },
    getFullById() {
      return null;
    },
    getTags() {
      return [];
    },
    setTags() {},
    addTags() {},
    removeTag() {},
  };
  return { repo, txns, updates };
}

describe('recategorizeNonManualTransactions', () => {
  it('re-derives category from description for every non-manual txn', () => {
    const { repo: ruleRepo } = makeFakeRuleRepo([
      { id: 1, ruleType: 'merchant', patternValue: 'zepto marketplace', categoryId: 'shopping', priority: 200 },
    ]);
    const { repo: txRepo, updates } = makeFakeTxRepo([
      { id: 10, description: 'UPI-Zepto Marketplace-zepto@ybl-1-order', categorySource: null },
      { id: 11, description: 'PAYMENT TO netflix india', categorySource: 'builtin_rule' },
      { id: 12, description: 'manual override txn', categorySource: 'manual' },
    ]);

    recategorizeNonManualTransactions({ ruleRepo, txRepo });

    // manual txn (id 12) must be skipped.
    expect(updates.map((u) => u.id).sort()).toEqual([10, 11]);
    expect(updates.find((u) => u.id === 10)).toEqual({
      id: 10,
      categoryId: 'shopping',
      categorySource: 'merchant_rule',
    });
    expect(updates.find((u) => u.id === 11)).toEqual({
      id: 11,
      categoryId: 'bills',
      categorySource: 'builtin_rule',
    });
  });
});

describe('saveCategoryMemoryRule', () => {
  it('no-ops when patternValue is null', () => {
    const { repo: ruleRepo, calls } = makeFakeRuleRepo();
    saveCategoryMemoryRule(
      { ruleRepo },
      { ruleType: 'merchant', patternValue: null, categoryId: 'food', createdFromTransactionId: 1 },
    );
    expect(calls.createRule).toHaveLength(0);
  });

  it('upserts with priority 200 for merchant', () => {
    const { repo: ruleRepo, calls } = makeFakeRuleRepo();
    saveCategoryMemoryRule(
      { ruleRepo },
      { ruleType: 'merchant', patternValue: 'zepto', categoryId: 'groceries', createdFromTransactionId: 7 },
    );
    expect(calls.createRule[0]).toMatchObject({
      ruleType: 'merchant',
      patternValue: 'zepto',
      categoryId: 'groceries',
      priority: 200,
      createdFromTransactionId: 7,
    });
  });

  it('upserts with priority 100 for upi_note_keyword', () => {
    const { repo: ruleRepo, calls } = makeFakeRuleRepo();
    saveCategoryMemoryRule(
      { ruleRepo },
      { ruleType: 'upi_note_keyword', patternValue: 'rent', categoryId: 'bills', createdFromTransactionId: 8 },
    );
    expect(calls.createRule[0].priority).toBe(100);
  });

  it('stores a keyword rule with priority 50', () => {
    const { repo: ruleRepo, calls } = makeFakeRuleRepo();
    saveCategoryMemoryRule(
      { ruleRepo },
      { ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food', createdFromTransactionId: 7 },
    );
    expect(calls.createRule).toHaveLength(1);
    expect(calls.createRule[0]).toMatchObject({
      ruleType: 'keyword',
      patternValue: 'swiggy',
      categoryId: 'food',
      priority: 50,
    });
  });
});

describe('createRule', () => {
  it('normalizes pattern, creates rule, then recategorizes', () => {
    const { repo: ruleRepo, rules, calls } = makeFakeRuleRepo();
    const { repo: txRepo, updates } = makeFakeTxRepo([
      { id: 1, description: 'UPI-Foo Bar-foo@ybl-1-note', categorySource: null },
    ]);

    createRule(
      { ruleRepo, txRepo },
      { ruleType: 'merchant', patternValue: '  Foo!! Bar  ', categoryId: 'food' },
    );

    expect(calls.createRule[0].patternValue).toBe('foo bar');
    expect(rules[0].categoryId).toBe('food');
    // recategorize ran
    expect(updates.find((u) => u.id === 1)?.categoryId).toBe('food');
  });

  it('throws when normalized pattern is empty', () => {
    const { repo: ruleRepo } = makeFakeRuleRepo();
    const { repo: txRepo } = makeFakeTxRepo();
    expect(() =>
      createRule({ ruleRepo, txRepo }, { ruleType: 'merchant', patternValue: '!!!', categoryId: 'food' }),
    ).toThrow();
  });
});

describe('updateRuleCategory', () => {
  it('updates category_id + rule_type + priority, then recategorizes', () => {
    const { repo: ruleRepo, rules, calls } = makeFakeRuleRepo([
      { id: 5, ruleType: 'upi_note_keyword', patternValue: 'p', categoryId: 'food', priority: 100 },
    ]);
    const { repo: txRepo } = makeFakeTxRepo([]);

    updateRuleCategory(
      { ruleRepo, txRepo },
      { ruleId: 5, categoryId: 'travel', ruleType: 'merchant' },
    );

    expect(calls.updateRuleCategory[0]).toEqual({
      ruleId: 5,
      categoryId: 'travel',
      ruleType: 'merchant',
      priority: 200,
    });
    expect(rules[0]).toMatchObject({ categoryId: 'travel', ruleType: 'merchant', priority: 200 });
  });

  it('preserves priority 50 when editing a keyword rule', () => {
    const { repo: ruleRepo, rules, calls } = makeFakeRuleRepo([
      { id: 9, ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food', priority: 50 },
    ]);
    const { repo: txRepo } = makeFakeTxRepo([]);

    updateRuleCategory(
      { ruleRepo, txRepo },
      { ruleId: 9, categoryId: 'shopping', ruleType: 'keyword' },
    );

    expect(calls.updateRuleCategory[0]).toEqual({
      ruleId: 9,
      categoryId: 'shopping',
      ruleType: 'keyword',
      priority: 50,
    });
    expect(rules[0]).toMatchObject({ categoryId: 'shopping', ruleType: 'keyword', priority: 50 });
  });
});

describe('deleteRule', () => {
  it('deletes the rule then recategorizes', () => {
    const { repo: ruleRepo, rules, calls } = makeFakeRuleRepo([
      { id: 9, ruleType: 'merchant', patternValue: 'x', categoryId: 'food', priority: 200 },
    ]);
    const { repo: txRepo } = makeFakeTxRepo([]);

    deleteRule({ ruleRepo, txRepo }, { ruleId: 9 });

    expect(calls.deleteRule).toEqual([9]);
    expect(rules).toHaveLength(0);
  });
});
