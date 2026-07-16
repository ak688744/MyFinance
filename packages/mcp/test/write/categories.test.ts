import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import {
  runCreateCategory, runRenameCategory, runDeleteCategory,
  runCreateRule, runUpdateRule, runDeleteRule, runRecategorizeAll,
} from '../../src/tools/write/categories';
import { runAddTransaction } from '../../src/tools/write/transactions';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('create_category', () => {
  it('creates a category with a slugified id', async () => {
    ctx = seedContext();
    const r = await runCreateCategory(ctx, { name: 'My Hobbies' });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as { id: string }).id;
    expect(ctx.repos.categoryRepo.exists(id)).toBe(true);
  });

  it('duplicate name returns isError', async () => {
    ctx = seedContext();
    await runCreateCategory(ctx, { name: 'My Hobbies' });
    const r = await runCreateCategory(ctx, { name: 'My Hobbies' });
    expect(r.isError).toBe(true);
  });
});

describe('rename_category', () => {
  it('renames an existing category', async () => {
    ctx = seedContext();
    const c = await runCreateCategory(ctx, { name: 'Old' });
    const id = (c.structuredContent as { id: string }).id;
    const r = await runRenameCategory(ctx, { id, name: 'New Name' });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.categoryRepo.list().find((x) => x.id === id)?.name).toBe('New Name');
  });

  it('unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runRenameCategory(ctx, { id: 'nope', name: 'X' });
    expect(r.isError).toBe(true);
  });
});

describe('delete_category (preview-gated, cascade)', () => {
  it('without confirm previews affected counts and deletes nothing', async () => {
    ctx = seedContext();
    const c = await runCreateCategory(ctx, { name: 'Hobbies' });
    const id = (c.structuredContent as { id: string }).id;
    await runAddTransaction(ctx, {
      transactionDate: '2026-01-01', description: 'Model kit', amountInr: 100, direction: 'out', categoryId: id,
    });
    const r = await runDeleteCategory(ctx, { id });
    expect(r.isError).toBeUndefined();
    expect((r.structuredContent as { preview: boolean }).preview).toBe(true);
    expect((r.structuredContent as { transactionCount: number }).transactionCount).toBe(1);
    expect(ctx.repos.categoryRepo.exists(id)).toBe(true);
  });

  it('with confirm deletes and reassigns transactions to null', async () => {
    ctx = seedContext();
    const c = await runCreateCategory(ctx, { name: 'Hobbies' });
    const id = (c.structuredContent as { id: string }).id;
    await runAddTransaction(ctx, {
      transactionDate: '2026-01-01', description: 'Model kit', amountInr: 100, direction: 'out', categoryId: id,
    });
    const r = await runDeleteCategory(ctx, { id, confirm: true });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.categoryRepo.exists(id)).toBe(false);
    expect(ctx.repos.expenseTxRepo.query({ categoryId: id }).length).toBe(0);
  });

  it('unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runDeleteCategory(ctx, { id: 'nope', confirm: true });
    expect(r.isError).toBe(true);
  });
});

describe('rules', () => {
  it('create_rule adds an active rule', async () => {
    ctx = seedContext();
    const r = await runCreateRule(ctx, { ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food' });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.categoryRuleRepo.getActiveRules().some((x) => x.patternValue === 'swiggy')).toBe(true);
  });

  it('create_rule with empty pattern returns isError', async () => {
    ctx = seedContext();
    const r = await runCreateRule(ctx, { ruleType: 'keyword', patternValue: '   ', categoryId: 'food' });
    expect(r.isError).toBe(true);
  });

  it('update_rule changes its category', async () => {
    ctx = seedContext();
    await runCreateRule(ctx, { ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food' });
    const ruleId = ctx.repos.categoryRuleRepo.getActiveRules().find((x) => x.patternValue === 'swiggy')!.id;
    const r = await runUpdateRule(ctx, { ruleId, categoryId: 'shopping', ruleType: 'keyword' });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.categoryRuleRepo.getActiveRules().find((x) => x.id === ruleId)?.categoryId).toBe('shopping');
  });

  it('update_rule unknown ruleId returns isError', async () => {
    ctx = seedContext();
    const r = await runUpdateRule(ctx, { ruleId: 9999, categoryId: 'food', ruleType: 'keyword' });
    expect(r.isError).toBe(true);
  });

  it('delete_rule (preview-gated) needs confirm', async () => {
    ctx = seedContext();
    await runCreateRule(ctx, { ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food' });
    const ruleId = ctx.repos.categoryRuleRepo.getActiveRules().find((x) => x.patternValue === 'swiggy')!.id;
    const p = await runDeleteRule(ctx, { ruleId });
    expect((p.structuredContent as { preview: boolean }).preview).toBe(true);
    expect(ctx.repos.categoryRuleRepo.getActiveRules().some((x) => x.id === ruleId)).toBe(true);
    const d = await runDeleteRule(ctx, { ruleId, confirm: true });
    expect(d.isError).toBeUndefined();
    expect(ctx.repos.categoryRuleRepo.getActiveRules().some((x) => x.id === ruleId)).toBe(false);
  });
});

describe('recategorize_all (preview-gated)', () => {
  it('without confirm previews and changes nothing; with confirm runs', async () => {
    ctx = seedContext();
    const p = await runRecategorizeAll(ctx, {});
    expect((p.structuredContent as { preview: boolean }).preview).toBe(true);
    const r = await runRecategorizeAll(ctx, { confirm: true });
    expect(r.isError).toBeUndefined();
    expect((r.structuredContent as { recategorized: boolean }).recategorized).toBe(true);
  });
});
