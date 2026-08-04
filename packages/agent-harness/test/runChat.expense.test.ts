import { describe, it, expect, afterEach } from 'vitest';
import { makeWealthHarness, type HarnessDeps } from '../src/runChat';
import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';

function baseRepos() {
  const wealthRoute = { task: 'wealth_chat', modelId: 'm1', updatedAt: 't' };
  const expenseRoute = { task: 'expense_agent', modelId: 'm1', updatedAt: 't' };
  return {
    routeRepo: {
      getByTask: (t: string) => {
        if (t === 'wealth_chat') return wealthRoute;
        if (t === 'expense_agent') return expenseRoute;
        return null;
      },
    } as any,
    modelRepo: { get: () => ({ id: 'm1', providerId: 'p1', modelString: 'gemini-2.5-flash', label: 'F', inputPerM: 1, outputPerM: 2, createdAt: 't' }) } as any,
    providerRepo: { get: () => ({ id: 'p1', dialect: 'gemini', label: 'G', secretEnc: 'ENC', configJson: null, createdAt: 't' }) } as any,
    decrypt: (b: string) => 'plain-key',
  };
}

function mockModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'expense clarity' }],
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      warnings: [],
    } as any),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', id: '1', delta: 'expense clarity' },
          { type: 'finish', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
        ],
      }),
    }),
  } as any);
}

describe('runChat agent selection', () => {
  const inserted: any[] = [];
  afterEach(() => { inserted.length = 0; });

  function deps(): HarnessDeps {
    return {
      ...baseRepos(),
      usageRepo: { insert: (e: any) => { inserted.push(e); return inserted.length; } },
      now: () => '2026-08-05T00:00:00.000Z',
      dbPath: ':memory:',
      memoryUrl: ':memory:',
      makeModel: () => mockModel(),
    } as HarnessDeps;
  }

  it('agent:"expense" records usage under expense_agent task', async () => {
    const h = makeWealthHarness(deps());
    const r = await h.runChat({ message: 'review these', agent: 'expense' });
    for await (const _ of r.textStream) { /* drain */ }
    await r.done;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].task).toBe('expense_agent');
  }, 30000);

  it('agent:"wealth" (explicit) records usage under wealth_chat task', async () => {
    const h = makeWealthHarness(deps());
    const r = await h.runChat({ message: 'invest extra', agent: 'wealth' });
    for await (const _ of r.textStream) { /* drain */ }
    await r.done;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].task).toBe('wealth_chat');
  }, 30000);

  it('agent:undefined (default) records usage under wealth_chat task', async () => {
    const h = makeWealthHarness(deps());
    const r = await h.runChat({ message: 'invest extra' });
    for await (const _ of r.textStream) { /* drain */ }
    await r.done;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].task).toBe('wealth_chat');
  }, 30000);
});
