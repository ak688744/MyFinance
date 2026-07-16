import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  extractMerchantKey,
  saveCategoryMemoryRule,
  recategorizeNonManualTransactions,
} from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, preview, type ToolResult } from '../../shared/output';

const dirToRepo = (d: 'in' | 'out'): 'credit' | 'debit' => (d === 'in' ? 'credit' : 'debit');

export async function runAddTransaction(
  ctx: McpContext,
  input: {
    transactionDate: string; description: string; amountInr: number;
    direction: 'in' | 'out'; categoryId?: string | null; note?: string | null; accountId?: number | null;
  },
): Promise<ToolResult> {
  if (!Number.isFinite(input.amountInr) || input.amountInr <= 0) {
    return errorResult('amountInr must be a positive, finite number.');
  }
  const id = ctx.repos.expenseTxRepo.insertManual({
    transactionDate: input.transactionDate,
    description: input.description,
    amount: input.amountInr,
    direction: dirToRepo(input.direction),
    categoryId: input.categoryId ?? null,
    note: input.note ?? null,
    accountId: input.accountId ?? null,
  });
  return ok({ id });
}

export async function runUpdateTransaction(
  ctx: McpContext,
  input: { id: number; amountInr?: number; note?: string | null },
): Promise<ToolResult> {
  const existing = ctx.repos.expenseTxRepo.getById(input.id);
  if (!existing) return errorResult(`Transaction ${input.id} not found.`);
  if (input.amountInr !== undefined) {
    if (!Number.isFinite(input.amountInr) || input.amountInr <= 0) {
      return errorResult('amountInr must be a positive, finite number.');
    }
    ctx.repos.expenseTxRepo.updateAmount(input.id, input.amountInr);
  }
  if (input.note !== undefined) {
    ctx.repos.expenseTxRepo.updateNote(input.id, input.note);
  }
  return ok({ id: input.id, updated: true });
}

export async function runDeleteTransaction(
  ctx: McpContext,
  input: { id: number; confirm?: boolean },
): Promise<ToolResult> {
  const existing = ctx.repos.expenseTxRepo.getById(input.id);
  if (!existing) return errorResult(`Transaction ${input.id} not found.`);
  if (input.confirm !== true) {
    return preview(`Would delete transaction ${input.id} ("${existing.description}").`, {
      transactionId: input.id,
    });
  }
  ctx.repos.expenseTxRepo.deleteTransaction(input.id);
  return ok({ id: input.id, deleted: true });
}

export async function runCategorizeTransaction(
  ctx: McpContext,
  input: { id: number; categoryId: string | null; learnRule?: 'merchant' | 'keyword'; keyword?: string },
): Promise<ToolResult> {
  const txn = ctx.repos.expenseTxRepo.getById(input.id);
  if (!txn) return errorResult(`Transaction ${input.id} not found.`);

  const deps = { ruleRepo: ctx.repos.categoryRuleRepo, txRepo: ctx.repos.expenseTxRepo };

  ctx.runInTransaction(() => {
    ctx.repos.expenseTxRepo.updateCategory(input.id, input.categoryId, 'manual');

    if (input.learnRule && input.categoryId !== null) {
      if (input.learnRule === 'merchant') {
        const merchantKey = extractMerchantKey(txn.description);
        if (merchantKey) {
          saveCategoryMemoryRule(deps, {
            ruleType: 'merchant', patternValue: merchantKey,
            categoryId: input.categoryId, createdFromTransactionId: input.id,
          });
          recategorizeNonManualTransactions(deps);
        }
      } else {
        const pattern = (input.keyword ?? '').trim();
        if (pattern.length >= 2) {
          try {
            saveCategoryMemoryRule(deps, {
              ruleType: 'keyword', patternValue: pattern,
              categoryId: input.categoryId, createdFromTransactionId: input.id,
            });
          } catch (e) {
            if (!/unique/i.test((e as Error).message)) throw e;
          }
          recategorizeNonManualTransactions(deps);
        }
      }
    }
  });

  return ok({ id: input.id, categoryId: input.categoryId });
}

export function registerTransactionWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'add_transaction',
    {
      description:
        'Add a manual expense/income transaction. `amountInr` (positive), `direction` "in"|"out", ' +
        'ISO `transactionDate`, optional `categoryId`/`note`/`accountId`. Returns the new id. ' +
        'RECIPE — SPLIT a transaction: call update_transaction to shrink the original to part A, ' +
        'then add_transaction for the remainder part B (copy date/description/direction/accountId); ' +
        'the two are separate calls (not atomic) — read back with list_transactions to verify. ' +
        'RECIPE — duplicate for next month: add_transaction with the date shifted forward.',
      inputSchema: {
        transactionDate: z.string(),
        description: z.string().min(1),
        amountInr: z.number().positive(),
        direction: z.enum(['in', 'out']),
        categoryId: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        accountId: z.number().int().nullable().optional(),
      },
    },
    async (input) => runAddTransaction(ctx, input),
  );

  server.registerTool(
    'update_transaction',
    {
      description:
        'Update a transaction\'s `amountInr` and/or `note` (only these are editable — merchant/date/' +
        'direction are import-owned). Unknown id returns an error. To SPLIT: shrink here, then ' +
        'add_transaction for the remainder (see that tool). Read back to verify (the two writes are not atomic).',
      inputSchema: {
        id: z.number().int(),
        amountInr: z.number().positive().optional(),
        note: z.string().nullable().optional(),
      },
    },
    async (input) => runUpdateTransaction(ctx, input),
  );

  server.registerTool(
    'delete_transaction',
    {
      description:
        'Delete one transaction. PREVIEW-GATED: without `confirm:true` returns what would be deleted ' +
        'and changes nothing; re-call with `confirm:true` to delete. Unknown id returns an error.',
      inputSchema: { id: z.number().int(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteTransaction(ctx, input),
  );

  server.registerTool(
    'categorize_transaction',
    {
      description:
        'Set a transaction\'s category (source=manual). Pass `categoryId:null` to clear it. ' +
        'Optional `learnRule`: "merchant" derives a merchant key from the description (structured ' +
        'UPI/ACH/POS formats only) and creates a rule; "keyword" needs `keyword` (>=2 chars). ' +
        'Learning a rule recategorizes other non-manual transactions. Atomic.',
      inputSchema: {
        id: z.number().int(),
        categoryId: z.string().nullable(),
        learnRule: z.enum(['merchant', 'keyword']).optional(),
        keyword: z.string().optional(),
      },
    },
    async (input) => runCategorizeTransaction(ctx, input),
  );
}
