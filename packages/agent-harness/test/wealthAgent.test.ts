import { describe, it, expect, afterAll } from 'vitest';
import { buildWealthMemory } from '../src/memory';
import { buildWealthAgent, WEALTH_INSTRUCTIONS } from '../src/wealthAgent';
import { buildFinanceMcpClient, getFinanceTools } from '../src/mcpClient';
import { MockLanguageModelV4 } from 'ai/test';

describe('wealth agent', () => {
  let client: any = null;
  afterAll(async () => { if (client?.disconnect) await client.disconnect(); });

  it('has a non-empty persona mentioning profile + tools', () => {
    expect(WEALTH_INSTRUCTIONS.length).toBeGreaterThan(50);
    expect(WEALTH_INSTRUCTIONS.toLowerCase()).toContain('profile');
  });

  it('instructs calibrated verbosity and clarifying questions', () => {
    const lower = WEALTH_INSTRUCTIONS.toLowerCase();
    // Calibration: matches depth to the question (few-shot / rules present).
    expect(lower).toContain('ask_user');
    // Anti-pattern guidance present (no mega-report-every-turn).
    expect(lower).toMatch(/1[–-]3 sentences|1 to 3 sentences|one to three sentences/);
  });

  it('calls the net-worth tool for a net-worth question', async () => {
    client = buildFinanceMcpClient({ dbPath: ':memory:' });
    const tools = await getFinanceTools(client);
    const memory = buildWealthMemory({ storeUrl: ':memory:' });

    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        call += 1;
        if (call === 1) {
          return {
            content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'finance_get_networth_overview', input: '{}' }],
            finishReason: 'tool-calls',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            warnings: [],
          } as any;
        }
        return {
          content: [{ type: 'text', text: 'Your net worth is computed above.' }],
          finishReason: 'stop',
          usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
          warnings: [],
        } as any;
      },
    });

    const agent = buildWealthAgent({ model: model as any, memory, tools });
    const res = await agent.generate('what is my net worth?', {
      memory: { resource: 'user', thread: 'test-thread-1' },
    });
    expect(res.text).toContain('net worth');
  }, 30000);
});
