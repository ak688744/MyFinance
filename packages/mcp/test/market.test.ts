import { describe, it, expect, afterEach } from 'vitest';
import { buildContext, type McpContext } from '../src/context';
import { fakeMarketData } from './helpers';
import { runSearchSchemes, runSchemeNav } from '../src/tools/read/market';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('search_schemes', () => {
  it('maps amfiCode from the (injected) market data', async () => {
    ctx = buildContext({
      dbPath: ':memory:',
      marketData: fakeMarketData({
        searchSchemes: async () => [
          { amfiCode: '147482', schemeName: 'Parag Parikh ELSS', fundHouse: 'PPFAS', category: 'Equity' } as any,
        ],
      }),
    });
    const r = await runSearchSchemes(ctx, { query: 'parag' });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.schemes).toEqual([{ amfiCode: '147482', schemeName: 'Parag Parikh ELSS' }]);
  });

  it('returns isError when the market source throws (mfapi down)', async () => {
    ctx = buildContext({
      dbPath: ':memory:',
      marketData: fakeMarketData({
        searchSchemes: async () => {
          throw new Error('network down');
        },
      }),
    });
    const r = await runSearchSchemes(ctx, { query: 'x' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('unavailable');
  });
});

describe('get_scheme_nav', () => {
  it('returns latest nav labelled navInr', async () => {
    ctx = buildContext({
      dbPath: ':memory:',
      marketData: fakeMarketData({ getLatestNAV: async () => 84.32 }),
    });
    const r = await runSchemeNav(ctx, { amfiCode: '147482' });
    const p = r.structuredContent as any;
    expect(p.amfiCode).toBe('147482');
    expect(p.latest.navInr).toBe(84.32);
  });

  it('returns isError when NAV lookup throws', async () => {
    ctx = buildContext({
      dbPath: ':memory:',
      marketData: fakeMarketData({
        getLatestNAV: async () => {
          throw new Error('boom');
        },
      }),
    });
    const r = await runSchemeNav(ctx, { amfiCode: '1' });
    expect(r.isError).toBe(true);
  });
});
