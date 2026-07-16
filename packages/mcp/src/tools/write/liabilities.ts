import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Liability } from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, preview, type ToolResult } from '../../shared/output';

export async function runAddLiability(
  ctx: McpContext,
  input: {
    name: string; loanType: Liability['loanType']; principalInr: number; annualRatePercent: number;
    tenureMonths?: number | null; emiAmountInr?: number | null; startDate: string; accountId?: number | null;
  },
): Promise<ToolResult> {
  if (!Number.isFinite(input.principalInr) || input.principalInr <= 0) {
    return errorResult('principalInr must be a positive, finite number.');
  }
  const hasTenure = input.tenureMonths != null;
  const hasEmi = input.emiAmountInr != null;
  if (hasTenure === hasEmi) {
    return errorResult('Provide exactly one of tenureMonths or emiAmountInr.');
  }
  const id = ctx.repos.liabilityRepo.create({
    accountId: input.accountId ?? null,
    name: input.name,
    loanType: input.loanType,
    principal: input.principalInr,
    annualRate: input.annualRatePercent,
    tenureMonths: input.tenureMonths ?? null,
    emiAmount: input.emiAmountInr ?? null,
    startDate: input.startDate,
  });
  return ok({ id });
}

export async function runUpdateLiability(
  ctx: McpContext,
  input: {
    id: number; name?: string; loanType?: Liability['loanType']; principalInr?: number;
    annualRatePercent?: number; tenureMonths?: number | null; emiAmountInr?: number | null;
    startDate?: string; status?: 'active' | 'closed';
  },
): Promise<ToolResult> {
  if (!ctx.repos.liabilityRepo.getById(input.id)) return errorResult(`Liability ${input.id} not found.`);
  if (input.principalInr !== undefined) {
    if (!Number.isFinite(input.principalInr) || input.principalInr <= 0) {
      return errorResult('principalInr must be a positive, finite number.');
    }
  }
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.loanType !== undefined) patch.loanType = input.loanType;
  if (input.principalInr !== undefined) patch.principal = input.principalInr;
  if (input.annualRatePercent !== undefined) patch.annualRate = input.annualRatePercent;
  if (input.tenureMonths !== undefined) patch.tenureMonths = input.tenureMonths;
  if (input.emiAmountInr !== undefined) patch.emiAmount = input.emiAmountInr;
  if (input.startDate !== undefined) patch.startDate = input.startDate;
  if (input.status !== undefined) patch.status = input.status;
  ctx.repos.liabilityRepo.update(input.id, patch as Parameters<typeof ctx.repos.liabilityRepo.update>[1]);
  return ok({ id: input.id, updated: true });
}

export async function runDeleteLiability(
  ctx: McpContext,
  input: { id: number; confirm?: boolean },
): Promise<ToolResult> {
  const loan = ctx.repos.liabilityRepo.getById(input.id);
  if (!loan) return errorResult(`Liability ${input.id} not found.`);
  if (input.confirm !== true) {
    return preview(`Would delete liability ${input.id} ("${loan.name}").`, { liabilityId: input.id });
  }
  ctx.repos.liabilityRepo.delete(input.id);
  return ok({ id: input.id, deleted: true });
}

export function registerLiabilityWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'add_liability',
    {
      description: 'Add a loan. `name`, `loanType` (home|car|personal|other), `principalInr` (positive), ' +
        '`annualRatePercent`, ISO `startDate`, and either `tenureMonths` OR `emiAmountInr`. Optional ' +
        '`accountId`. EMI/amortization are computed by the read tools.',
      inputSchema: {
        name: z.string().min(1),
        loanType: z.enum(['home', 'car', 'personal', 'other']),
        principalInr: z.number().positive(),
        annualRatePercent: z.number(),
        tenureMonths: z.number().int().nullable().optional(),
        emiAmountInr: z.number().nullable().optional(),
        startDate: z.string(),
        accountId: z.number().int().nullable().optional(),
      },
    },
    async (input) => runAddLiability(ctx, input as Parameters<typeof runAddLiability>[1]),
  );

  server.registerTool(
    'update_liability',
    {
      description: 'Update a loan\'s fields by `id` (name/loanType/principalInr/annualRatePercent/' +
        'tenureMonths/emiAmountInr/startDate/status). Set `status:"closed"` to close a paid-off loan. ' +
        'Unknown id returns an error.',
      inputSchema: {
        id: z.number().int(),
        name: z.string().optional(),
        loanType: z.enum(['home', 'car', 'personal', 'other']).optional(),
        principalInr: z.number().positive().optional(),
        annualRatePercent: z.number().optional(),
        tenureMonths: z.number().int().nullable().optional(),
        emiAmountInr: z.number().nullable().optional(),
        startDate: z.string().optional(),
        status: z.enum(['active', 'closed']).optional(),
      },
    },
    async (input) => runUpdateLiability(ctx, input as Parameters<typeof runUpdateLiability>[1]),
  );

  server.registerTool(
    'delete_liability',
    {
      description: 'Delete a loan by `id`. PREVIEW-GATED: without `confirm:true` describes what would be ' +
        'deleted and does nothing; re-call with `confirm:true`. Prefer update_liability status:"closed" ' +
        'to retire a paid-off loan.',
      inputSchema: { id: z.number().int(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteLiability(ctx, input),
  );
}
