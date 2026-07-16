import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  slugifyCategoryName,
  createRule as coreCreateRule,
  updateRuleCategory as coreUpdateRuleCategory,
  deleteRule as coreDeleteRule,
  recategorizeNonManualTransactions,
  type CategoryRuleType,
} from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, preview, type ToolResult } from '../../shared/output';

const rulesDeps = (ctx: McpContext) => ({
  ruleRepo: ctx.repos.categoryRuleRepo,
  txRepo: ctx.repos.expenseTxRepo,
});

export async function runCreateCategory(
  ctx: McpContext,
  input: { name: string; icon?: string | null },
): Promise<ToolResult> {
  const name = input.name.trim();
  if (!name) return errorResult('name is required.');
  const id = slugifyCategoryName(name);
  if (ctx.repos.categoryRepo.exists(id)) return errorResult(`Category '${id}' already exists.`);
  ctx.repos.categoryRepo.create({ id, name, icon: input.icon ?? null });
  return ok({ id });
}

export async function runRenameCategory(
  ctx: McpContext,
  input: { id: string; name: string },
): Promise<ToolResult> {
  const name = input.name.trim();
  if (!name) return errorResult('name is required.');
  if (!ctx.repos.categoryRepo.exists(input.id)) return errorResult(`Category '${input.id}' not found.`);
  ctx.repos.categoryRepo.rename(input.id, name);
  return ok({ id: input.id, name });
}

export async function runDeleteCategory(
  ctx: McpContext,
  input: { id: string; confirm?: boolean },
): Promise<ToolResult> {
  if (!ctx.repos.categoryRepo.exists(input.id)) return errorResult(`Category '${input.id}' not found.`);
  const transactionCount = ctx.repos.expenseTxRepo.query({ categoryId: input.id }).length;
  const ruleCount = ctx.repos.categoryRuleRepo.getActiveRules().filter((r) => r.categoryId === input.id).length;
  if (input.confirm !== true) {
    return preview(
      `Would delete category '${input.id}', reassign ${transactionCount} transaction(s) to Uncategorized, ` +
      `and delete ${ruleCount} dependent rule(s).`,
      { categoryId: input.id, transactionCount, ruleCount },
    );
  }
  ctx.repos.categoryRepo.delete(input.id);
  return ok({ id: input.id, deleted: true, transactionCount, ruleCount });
}

export async function runCreateRule(
  ctx: McpContext,
  input: { ruleType: CategoryRuleType; patternValue: string; categoryId: string },
): Promise<ToolResult> {
  try {
    coreCreateRule(rulesDeps(ctx), {
      ruleType: input.ruleType, patternValue: input.patternValue, categoryId: input.categoryId,
    });
  } catch (e) {
    return errorResult((e as Error).message);
  }
  return ok({ created: true });
}

export async function runUpdateRule(
  ctx: McpContext,
  input: { ruleId: number; categoryId: string; ruleType: CategoryRuleType },
): Promise<ToolResult> {
  coreUpdateRuleCategory(rulesDeps(ctx), {
    ruleId: input.ruleId, categoryId: input.categoryId, ruleType: input.ruleType,
  });
  return ok({ ruleId: input.ruleId, updated: true });
}

export async function runDeleteRule(
  ctx: McpContext,
  input: { ruleId: number; confirm?: boolean },
): Promise<ToolResult> {
  const rule = ctx.repos.categoryRuleRepo.getActiveRules().find((r) => r.id === input.ruleId);
  if (!rule) return errorResult(`Rule ${input.ruleId} not found.`);
  if (input.confirm !== true) {
    return preview(
      `Would delete rule ${input.ruleId} ("${rule.patternValue}" → ${rule.categoryId}) and recategorize.`,
      { ruleId: input.ruleId },
    );
  }
  coreDeleteRule(rulesDeps(ctx), { ruleId: input.ruleId });
  return ok({ ruleId: input.ruleId, deleted: true });
}

export async function runRecategorizeAll(
  ctx: McpContext,
  input: { confirm?: boolean },
): Promise<ToolResult> {
  if (input.confirm !== true) {
    return preview(
      'Would re-run categorization over all non-manual transactions using the current rules.',
    );
  }
  recategorizeNonManualTransactions(rulesDeps(ctx));
  return ok({ recategorized: true });
}

export function registerCategoryWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'create_category',
    {
      description: 'Create a spending category. `name` required; id is slugified from the name. ' +
        'Duplicate id returns an error. Optional `icon`.',
      inputSchema: { name: z.string().min(1), icon: z.string().nullable().optional() },
    },
    async (input) => runCreateCategory(ctx, input),
  );

  server.registerTool(
    'rename_category',
    {
      description: 'Rename an existing category by `id`. Unknown id returns an error.',
      inputSchema: { id: z.string(), name: z.string().min(1) },
    },
    async (input) => runRenameCategory(ctx, input),
  );

  server.registerTool(
    'delete_category',
    {
      description: 'Delete a category. CASCADE: reassigns its transactions to Uncategorized and drops ' +
        'dependent rules. PREVIEW-GATED: without `confirm:true` returns the affected transaction/rule ' +
        'counts and changes nothing; re-call with `confirm:true` to delete. Unknown id returns an error.',
      inputSchema: { id: z.string(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteCategory(ctx, input),
  );

  server.registerTool(
    'create_rule',
    {
      description: 'Create a categorization rule. `ruleType`: "merchant" (exact merchant key), ' +
        '"upi_note_keyword" (exact), or "keyword" (substring). `patternValue` non-empty, `categoryId`. ' +
        'Creating a rule recategorizes non-manual transactions. Empty pattern returns an error.',
      inputSchema: {
        ruleType: z.enum(['merchant', 'upi_note_keyword', 'keyword']),
        patternValue: z.string(),
        categoryId: z.string(),
      },
    },
    async (input) => runCreateRule(ctx, input),
  );

  server.registerTool(
    'update_rule',
    {
      description: 'Change a rule\'s target `categoryId` (and `ruleType`) by `ruleId`. Recategorizes ' +
        'non-manual transactions.',
      inputSchema: {
        ruleId: z.number().int(),
        categoryId: z.string(),
        ruleType: z.enum(['merchant', 'upi_note_keyword', 'keyword']),
      },
    },
    async (input) => runUpdateRule(ctx, input),
  );

  server.registerTool(
    'delete_rule',
    {
      description: 'Delete a categorization rule by `ruleId` and recategorize. PREVIEW-GATED: without ' +
        '`confirm:true` returns what would change and does nothing; re-call with `confirm:true`.',
      inputSchema: { ruleId: z.number().int(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteRule(ctx, input),
  );

  server.registerTool(
    'recategorize_all',
    {
      description: 'Re-run categorization over ALL non-manual transactions using the current rule set ' +
        '(wide blast radius). PREVIEW-GATED: without `confirm:true` describes the operation and does ' +
        'nothing; re-call with `confirm:true` to run.',
      inputSchema: { confirm: z.boolean().optional() },
    },
    async (input) => runRecategorizeAll(ctx, input),
  );
}
