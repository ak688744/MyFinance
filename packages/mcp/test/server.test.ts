import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildContext, type McpContext } from '../src/context';
import { fakeMarketData } from './helpers';
import { buildServer } from '../src/server';

let ctx: McpContext;
afterEach(() => ctx?.close());

const EXPECTED_READ_TOOLS = [
  'get_networth_overview',
  'get_investment_portfolio',
  'get_investment_returns',
  'get_expense_summary',
  'list_transactions',
  'get_loans_overview',
  'get_loan_amortization',
  'list_accounts',
  'search_schemes',
  'get_scheme_nav',
];

const EXPECTED_WRITE_TOOLS = [
  'add_transaction', 'update_transaction', 'delete_transaction', 'categorize_transaction',
  'create_category', 'rename_category', 'delete_category',
  'create_rule', 'update_rule', 'delete_rule', 'recategorize_all',
  'create_account',
  'add_asset', 'update_asset', 'close_asset',
  'add_asset_contribution', 'add_asset_valuation', 'add_asset_rate', 'delete_asset',
  'add_liability', 'update_liability', 'delete_liability',
];

const EXPECTED_TOOLS = [...EXPECTED_READ_TOOLS, ...EXPECTED_WRITE_TOOLS];

async function connectedClient(): Promise<Client> {
  ctx = buildContext({ dbPath: ':memory:', marketData: fakeMarketData() });
  const server = buildServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('MCP server (protocol smoke)', () => {
  it('registers all 10 read tools and 22 write tools', async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
    for (const name of EXPECTED_WRITE_TOOLS) {
      expect(names).toContain(name);
    }
    await client.close();
  });

  it('round-trips get_networth_overview over the transport', async () => {
    const client = await connectedClient();
    const res = await client.callTool({ name: 'get_networth_overview', arguments: {} });
    // content is the universal channel; parse the JSON text block
    const text = (res.content as any[])[0].text;
    const payload = JSON.parse(text);
    expect(payload.netWorthInr).toBe(0);
    expect(res.isError).toBeFalsy();
    await client.close();
  });

  it('surfaces a semantic error as isError over the transport', async () => {
    const client = await connectedClient();
    const res = await client.callTool({
      name: 'get_loan_amortization',
      arguments: { liabilityId: 999 },
    });
    expect(res.isError).toBe(true);
    await client.close();
  });
});
