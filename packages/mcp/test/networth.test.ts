import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runNetworthOverview } from '../src/tools/read/networth';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('get_networth_overview', () => {
  it('returns zeros on an empty DB (empty is valid, not an error)', async () => {
    ctx = seedContext();
    const r = await runNetworthOverview(ctx);
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.totalAssetsInr).toBe(0);
    expect(p.totalLiabilitiesInr).toBe(0);
    expect(p.netWorthInr).toBe(0);
    expect(p.assets).toEqual([]);
    expect(p.byAssetClass).toEqual([]);
  });

  it('projects a manual asset with INR-labelled fields', async () => {
    ctx = seedContext();
    const accountId = ctx.repos.accountRepo.create({
      domain: 'investment', institution: 'SBI', label: 'Gold',
    });
    const assetId = ctx.repos.assetRepo.create({
      accountId, assetClass: 'gold', name: 'Gold bar',
      valuationStrategy: 'manual', ingestionMode: 'manual_entry',
      params: {}, status: 'active',
    });
    ctx.repos.assetValuationRepo.insert({
      assetId, value: 200000, valuedAt: '2025-01-01',
    });

    const r = await runNetworthOverview(ctx);
    const p = r.structuredContent as any;
    expect(p.totalAssetsInr).toBe(200000);
    expect(p.netWorthInr).toBe(200000);
    const gold = p.byAssetClass.find((c: any) => c.assetClass === 'gold');
    expect(gold.valueInr).toBe(200000);
    expect(p.assets[0].currentValueInr).toBe(200000);
    expect(p.assets[0].name).toBe('Gold bar');
  });
});
