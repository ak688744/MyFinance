import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import {
  runAddAsset, runUpdateAsset, runCloseAsset,
  runAddAssetContribution, runAddAssetValuation, runAddAssetRate, runDeleteAsset,
} from '../../src/tools/write/assets';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

function makeAccount(ctx: McpContext): number {
  return ctx.repos.accountRepo.ensureAccount({ domain: 'investment', institution: 'Self', label: 'PPF' });
}

describe('add_asset', () => {
  it('creates a computed asset and returns its id', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const r = await runAddAsset(ctx, {
      accountId, assetClass: 'ppf', name: 'PPF SBI', valuationStrategy: 'computed',
    });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as { id: number }).id;
    expect(ctx.repos.assetRepo.getById(id)).toBeTruthy();
  });
});

describe('update_asset / close_asset', () => {
  it('updates the name', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual' })).structuredContent!.id as number;
    const r = await runUpdateAsset(ctx, { id, name: 'Gold Bars' });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.assetRepo.getById(id)?.name).toBe('Gold Bars');
  });

  it('close_asset sets status to closed', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'fd', name: 'FD', valuationStrategy: 'computed' })).structuredContent!.id as number;
    const r = await runCloseAsset(ctx, { id });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.assetRepo.getById(id)?.status).toBe('closed');
  });

  it('update_asset unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runUpdateAsset(ctx, { id: 9999, name: 'X' });
    expect(r.isError).toBe(true);
  });
});

describe('asset sub-resources (append-only)', () => {
  it('adds a contribution, valuation, and rate', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'ppf', name: 'PPF', valuationStrategy: 'computed' })).structuredContent!.id as number;

    const c = await runAddAssetContribution(ctx, { assetId: id, contributionDate: '2026-01-01', amountInr: 5000 });
    expect(c.isError).toBeUndefined();
    expect(ctx.repos.assetContributionRepo.listByAsset(id).length).toBe(1);

    const v = await runAddAssetValuation(ctx, { assetId: id, valueInr: 50000, valuedAt: '2026-01-01' });
    expect(v.isError).toBeUndefined();
    expect(ctx.repos.assetValuationRepo.listByAsset(id).length).toBe(1);

    const rt = await runAddAssetRate(ctx, { assetId: id, effectiveFrom: '2026-01-01', ratePercent: 7.1 });
    expect(rt.isError).toBeUndefined();
    expect(ctx.repos.assetRateRepo.listByAsset(id).length).toBe(1);
  });

  it('contribution on unknown asset returns isError', async () => {
    ctx = seedContext();
    const r = await runAddAssetContribution(ctx, { assetId: 9999, contributionDate: '2026-01-01', amountInr: 100 });
    expect(r.isError).toBe(true);
  });

  it('rejects non-positive contribution amount', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'ppf', name: 'PPF', valuationStrategy: 'computed' })).structuredContent!.id as number;
    const r = await runAddAssetContribution(ctx, { assetId: id, contributionDate: '2026-01-01', amountInr: -100 });
    expect(r.isError).toBe(true);
    expect(ctx.repos.assetContributionRepo.listByAsset(id).length).toBe(0);
  });

  it('rejects non-positive valuation', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual' })).structuredContent!.id as number;
    const r = await runAddAssetValuation(ctx, { assetId: id, valueInr: 0, valuedAt: '2026-01-01' });
    expect(r.isError).toBe(true);
    expect(ctx.repos.assetValuationRepo.listByAsset(id).length).toBe(0);
  });

  it('rejects negative rate', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'ppf', name: 'PPF', valuationStrategy: 'computed' })).structuredContent!.id as number;
    const r = await runAddAssetRate(ctx, { assetId: id, effectiveFrom: '2026-01-01', ratePercent: -7 });
    expect(r.isError).toBe(true);
    expect(ctx.repos.assetRateRepo.listByAsset(id).length).toBe(0);
  });

  it('accepts zero rate (no interest)', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'fd', name: 'FD', valuationStrategy: 'computed' })).structuredContent!.id as number;
    const r = await runAddAssetRate(ctx, { assetId: id, effectiveFrom: '2026-01-01', ratePercent: 0 });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.assetRateRepo.listByAsset(id).length).toBe(1);
  });
});

describe('delete_asset (preview-gated)', () => {
  it('needs confirm', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual' })).structuredContent!.id as number;
    const p = await runDeleteAsset(ctx, { id });
    expect((p.structuredContent as { preview: boolean }).preview).toBe(true);
    expect(ctx.repos.assetRepo.getById(id)).toBeTruthy();
    const d = await runDeleteAsset(ctx, { id, confirm: true });
    expect(d.isError).toBeUndefined();
    expect(ctx.repos.assetRepo.getById(id)).toBeNull();
  });
});
