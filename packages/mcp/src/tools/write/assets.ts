import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Asset } from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, preview, type ToolResult } from '../../shared/output';

const ASSET_CLASSES = ['ppf', 'epf', 'nps', 'fd', 'gold', 'real_estate', 'cash'] as const;

export async function runAddAsset(
  ctx: McpContext,
  input: {
    accountId: number; assetClass: Asset['assetClass']; name: string;
    valuationStrategy: 'computed' | 'manual'; ingestionMode?: Asset['ingestionMode'];
    params?: Asset['params']; openedAt?: string | null;
  },
): Promise<ToolResult> {
  if (!ctx.repos.accountRepo.getById(input.accountId)) {
    return errorResult(`Account ${input.accountId} not found.`);
  }
  const id = ctx.repos.assetRepo.create({
    accountId: input.accountId,
    assetClass: input.assetClass,
    name: input.name,
    valuationStrategy: input.valuationStrategy,
    ingestionMode: input.ingestionMode,
    params: input.params,
    openedAt: input.openedAt ?? null,
  });
  return ok({ id });
}

export async function runUpdateAsset(
  ctx: McpContext,
  input: { id: number; name?: string; status?: 'active' | 'closed'; params?: Asset['params']; openedAt?: string | null },
): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.id)) return errorResult(`Asset ${input.id} not found.`);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.status !== undefined) patch.status = input.status;
  if (input.params !== undefined) patch.params = input.params;
  if (input.openedAt !== undefined) patch.openedAt = input.openedAt;
  ctx.repos.assetRepo.update(input.id, patch as Parameters<typeof ctx.repos.assetRepo.update>[1]);
  return ok({ id: input.id, updated: true });
}

export async function runCloseAsset(ctx: McpContext, input: { id: number }): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.id)) return errorResult(`Asset ${input.id} not found.`);
  ctx.repos.assetRepo.update(input.id, { status: 'closed' });
  return ok({ id: input.id, status: 'closed' });
}

export async function runAddAssetContribution(
  ctx: McpContext,
  input: { assetId: number; contributionDate: string; amountInr: number; note?: string | null },
): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.assetId)) return errorResult(`Asset ${input.assetId} not found.`);
  if (!Number.isFinite(input.amountInr) || input.amountInr <= 0) {
    return errorResult('amountInr must be a positive, finite number.');
  }
  const id = ctx.repos.assetContributionRepo.insert({
    assetId: input.assetId, contributionDate: input.contributionDate, amount: input.amountInr, note: input.note ?? null,
  });
  return ok({ id });
}

export async function runAddAssetValuation(
  ctx: McpContext,
  input: { assetId: number; valueInr: number; valuedAt: string; note?: string | null },
): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.assetId)) return errorResult(`Asset ${input.assetId} not found.`);
  if (!Number.isFinite(input.valueInr) || input.valueInr <= 0) {
    return errorResult('valueInr must be a positive, finite number.');
  }
  const id = ctx.repos.assetValuationRepo.insert({
    assetId: input.assetId, value: input.valueInr, valuedAt: input.valuedAt, note: input.note ?? null,
  });
  return ok({ id });
}

export async function runAddAssetRate(
  ctx: McpContext,
  input: { assetId: number; effectiveFrom: string; ratePercent: number },
): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.assetId)) return errorResult(`Asset ${input.assetId} not found.`);
  if (!Number.isFinite(input.ratePercent) || input.ratePercent < 0) {
    return errorResult('ratePercent must be a finite number >= 0.');
  }
  const id = ctx.repos.assetRateRepo.insert({
    assetId: input.assetId, effectiveFrom: input.effectiveFrom, rate: input.ratePercent,
  });
  return ok({ id });
}

export async function runDeleteAsset(
  ctx: McpContext,
  input: { id: number; confirm?: boolean },
): Promise<ToolResult> {
  const asset = ctx.repos.assetRepo.getById(input.id);
  if (!asset) return errorResult(`Asset ${input.id} not found.`);
  if (input.confirm !== true) {
    return preview(`Would delete asset ${input.id} ("${asset.name}") and its contributions/valuations/rates.`, {
      assetId: input.id,
    });
  }
  ctx.repos.assetRepo.delete(input.id);
  return ok({ id: input.id, deleted: true });
}

export function registerAssetWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'add_asset',
    {
      description: 'Add a non-market asset (FD/PPF/EPF/NPS/gold/real_estate/cash). Requires `accountId` ' +
        '(create with create_account first), `assetClass`, `name`, `valuationStrategy` ("computed" for ' +
        'FD/PPF/EPF/NPS, "manual" for gold/real_estate/cash). Optional `params` (JSON: compounding, ' +
        'maturityDate, grams, …), `openedAt`. Then use add_asset_contribution/valuation/rate. Mutual ' +
        'funds are NOT assets here — they come from the MF pipeline.',
      inputSchema: {
        accountId: z.number().int(),
        assetClass: z.enum(ASSET_CLASSES),
        name: z.string().min(1),
        valuationStrategy: z.enum(['computed', 'manual']),
        ingestionMode: z.enum(['manual_entry', 'file_import']).optional(),
        params: z.record(z.any()).optional(),
        openedAt: z.string().nullable().optional(),
      },
    },
    async (input) => runAddAsset(ctx, input as Parameters<typeof runAddAsset>[1]),
  );

  server.registerTool(
    'update_asset',
    {
      description: 'Update an asset\'s `name`, `status`, `params`, or `openedAt`. Unknown id returns an error.',
      inputSchema: {
        id: z.number().int(),
        name: z.string().optional(),
        status: z.enum(['active', 'closed']).optional(),
        params: z.record(z.any()).optional(),
        openedAt: z.string().nullable().optional(),
      },
    },
    async (input) => runUpdateAsset(ctx, input as Parameters<typeof runUpdateAsset>[1]),
  );

  server.registerTool(
    'close_asset',
    {
      description: 'Mark an asset as closed (status="closed"); it stops counting toward net worth. ' +
        'Convenience for update_asset with status:"closed". Unknown id returns an error.',
      inputSchema: { id: z.number().int() },
    },
    async (input) => runCloseAsset(ctx, input),
  );

  server.registerTool(
    'add_asset_contribution',
    {
      description: 'Append a contribution (deposit) to an asset — FD single deposit; PPF/EPF/NPS recurring. ' +
        '`amountInr`, ISO `contributionDate`, optional `note`. Append-only.',
      inputSchema: {
        assetId: z.number().int(), contributionDate: z.string(),
        amountInr: z.number(), note: z.string().nullable().optional(),
      },
    },
    async (input) => runAddAssetContribution(ctx, input),
  );

  server.registerTool(
    'add_asset_valuation',
    {
      description: 'Append a stated valuation to a manual asset (gold/real_estate/cash) — `valueInr` at ' +
        'ISO `valuedAt`, optional `note`. Append-only time series.',
      inputSchema: {
        assetId: z.number().int(), valueInr: z.number(),
        valuedAt: z.string(), note: z.string().nullable().optional(),
      },
    },
    async (input) => runAddAssetValuation(ctx, input),
  );

  server.registerTool(
    'add_asset_rate',
    {
      description: 'Append an interest-rate period to a computed asset (FD/PPF/EPF/NPS). `ratePercent` ' +
        '(annual %) effective from ISO `effectiveFrom`. Multiple periods model rate changes (e.g. PPF resets).',
      inputSchema: {
        assetId: z.number().int(), effectiveFrom: z.string(), ratePercent: z.number(),
      },
    },
    async (input) => runAddAssetRate(ctx, input),
  );

  server.registerTool(
    'delete_asset',
    {
      description: 'Delete an asset and its contributions/valuations/rates. PREVIEW-GATED: without ' +
        '`confirm:true` describes what would be removed and does nothing; re-call with `confirm:true`. ' +
        'Prefer close_asset to retire an asset while keeping its history.',
      inputSchema: { id: z.number().int(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteAsset(ctx, input),
  );
}
