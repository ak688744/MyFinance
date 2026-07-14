import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

// Match the API's current defaults (packages/api/src/routes/expenses.ts)
const EXCLUDE_FROM_SPEND = ['investment', 'self_transfer'];
const INVESTMENT_CATEGORIES = ['investment'];

export async function runExpenseSummary(
  ctx: McpContext,
  input: { from: string; to: string },
): Promise<ToolResult> {
  const s = ctx.repos.expenseTxRepo.summary({
    from: input.from,
    to: input.to,
    excludeFromSpend: EXCLUDE_FROM_SPEND,
    investmentCategories: INVESTMENT_CATEGORIES,
  });
  return ok({
    totalSpentInr: s.totalSpent,
    totalIncomeInr: s.totalIncome,
    savedInr: s.saved,
    investedInr: s.invested,
    byCategory: s.byCategory.map((c) => ({ categoryId: c.categoryId, amountInr: c.amount })),
    byMonth: s.byMonth.map((m) => ({ month: m.month, spentInr: m.spent })),
  });
}

export async function runListTransactions(
  ctx: McpContext,
  input: {
    from?: string; to?: string; direction?: 'in' | 'out'; search?: string;
    categoryId?: string; accountId?: number; limit?: number; offset?: number;
  },
): Promise<ToolResult> {
  const rows = ctx.repos.expenseTxRepo.query({
    ...(input.from !== undefined ? { from: input.from } : {}),
    ...(input.to !== undefined ? { to: input.to } : {}),
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.search !== undefined ? { search: input.search } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    limit: input.limit ?? 50,
    ...(input.offset !== undefined ? { offset: input.offset } : {}),
  });
  return ok({ transactions: rows, count: rows.length });
}

export function registerExpenseTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_expense_summary',
    {
      description:
        'Expense cash-flow summary for a date range: total spent / income / saved / ' +
        'invested plus by-category and by-month breakdowns. Required `from` and `to` ' +
        '(ISO YYYY-MM-DD). Investment and self-transfer categories are excluded from "spent"; ' +
        'investment debits are surfaced as `investedInr`. All money fields are INR.',
      inputSchema: {
        from: z.string(),
        to: z.string(),
      },
    },
    async (input) => runExpenseSummary(ctx, input),
  );

  server.registerTool(
    'list_transactions',
    {
      description:
        'List expense/bank transactions (most recent first), paginated. Optional filters: ' +
        '`from`/`to` (ISO date), `direction` ("in"|"out"), `search` (description substring), ' +
        '`categoryId`, `accountId`, `limit` (default 50, max 200), `offset`. Amounts are INR.',
      inputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
        direction: z.enum(['in', 'out']).optional(),
        search: z.string().optional(),
        categoryId: z.string().optional(),
        accountId: z.number().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (input) => runListTransactions(ctx, input),
  );
}
