import { describe, it, expect, afterAll } from 'vitest';
import { buildFinanceMcpClient, getFinanceTools } from '../src/mcpClient';

describe('finance MCP client', () => {
  let client: ReturnType<typeof buildFinanceMcpClient> | null = null;

  afterAll(async () => {
    if (client && typeof (client as any).disconnect === 'function') {
      await (client as any).disconnect();
    }
  });

  it('lists the finance tools from the stdio MCP server', async () => {
    client = buildFinanceMcpClient({ dbPath: ':memory:' });
    const tools = await getFinanceTools(client);
    const names = Object.keys(tools);
    expect(names).toContain('finance_get_networth_overview');
    expect(names).toContain('finance_list_transactions');
    expect(names).toContain('finance_add_transaction');
    expect(names.length).toBeGreaterThanOrEqual(32);
  }, 30000);
});
