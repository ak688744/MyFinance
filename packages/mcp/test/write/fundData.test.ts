import { describe, it, expect, afterEach } from 'vitest';
import { seedContext, fakeFundData } from '../helpers';
import { runRefreshFundData } from '../../src/tools/write/fundData';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('refresh_fund_data', () => {
  it('returns ok when ingest succeeds', async () => {
    ctx = seedContext({
      fundData: fakeFundData({
        ingest: async () => ({
          schemeId: 7,
          source: 'groww',
          asOfDate: '2026-08-31',
          holdingsCount: 5,
        }),
      }),
    });
    const r = await runRefreshFundData(ctx, { amfiCode: '100001' });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({
      schemeId: 7,
      holdingsCount: 5,
    });
  });

  it('returns isError when ingest throws', async () => {
    ctx = seedContext({
      fundData: fakeFundData({
        ingest: async () => {
          throw new Error('network down');
        },
      }),
    });
    const r = await runRefreshFundData(ctx, { amfiCode: '100001' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('network down');
  });

  it('resolves the AMFI code from schemeId (agent must not guess codes)', async () => {
    const seen: string[] = [];
    ctx = seedContext({
      fundData: fakeFundData({
        ingest: async (code: string) => {
          seen.push(code);
          return { schemeId: 1, source: 'groww', asOfDate: '2026-08-31', holdingsCount: 3 };
        },
      }),
    });
    const id = Number(ctx.sqlite.prepare(
      "INSERT INTO investment_schemes (scheme_name, amfi_code) VALUES ('Parag Parikh Flexi Cap','122639')",
    ).run().lastInsertRowid);
    const r = await runRefreshFundData(ctx, { schemeId: id });
    expect(r.isError).toBeUndefined();
    expect(seen).toEqual(['122639']); // resolved from the DB, not guessed
  });

  it('returns a clear error for a scheme with no AMFI code (unfetchable)', async () => {
    ctx = seedContext({ fundData: fakeFundData({ ingest: async () => { throw new Error('should not be called'); } }) });
    const id = Number(ctx.sqlite.prepare(
      "INSERT INTO investment_schemes (scheme_name, amfi_code) VALUES ('ICICI Ultra Short Term', NULL)",
    ).run().lastInsertRowid);
    const r = await runRefreshFundData(ctx, { schemeId: id });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('no AMFI code');
  });
});
