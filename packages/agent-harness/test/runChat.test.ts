import { describe, it, expect, afterEach } from 'vitest';
import { makeWealthHarness, type HarnessDeps } from '../src/runChat';
import { AgentConfigError } from '../src/modelResolver';
import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';

function baseRepos(routeExists = true) {
  const route = routeExists ? { task: 'wealth_chat', modelId: 'm1', updatedAt: 't' } : null;
  return {
    routeRepo: { getByTask: (t: string) => (t === 'wealth_chat' ? route : null) } as any,
    modelRepo: { get: () => ({ id: 'm1', providerId: 'p1', modelString: 'gemini-2.5-flash', label: 'F', inputPerM: 1, outputPerM: 2, createdAt: 't' }) } as any,
    providerRepo: { get: () => ({ id: 'p1', dialect: 'gemini', label: 'G', secretEnc: 'ENC', configJson: null, createdAt: 't' }) } as any,
    decrypt: (b: string) => 'plain-key',
  };
}

function mockModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'hello from agent' }],
      finishReason: 'stop',
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      warnings: [],
    } as any),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', id: '1', delta: 'hello from agent' },
          { type: 'finish', finishReason: 'stop', usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 } },
        ],
      }),
    }),
  } as any);
}

describe('makeWealthHarness.runChat', () => {
  const inserted: any[] = [];
  afterEach(() => { inserted.length = 0; });

  function deps(routeExists = true): HarnessDeps {
    return {
      ...baseRepos(routeExists),
      usageRepo: { insert: (e: any) => { inserted.push(e); return inserted.length; } },
      now: () => '2026-07-18T00:00:00.000Z',
      dbPath: ':memory:',
      memoryUrl: ':memory:',
      makeModel: () => mockModel(),
    } as HarnessDeps;
  }

  it('streams text and mints a threadId when none is given', async () => {
    const h = makeWealthHarness(deps());
    const r = await h.runChat({ message: 'hi' });
    expect(r.threadId).toBeTruthy();
    let out = '';
    for await (const chunk of r.textStream) out += chunk;
    await r.done;
    expect(out).toContain('hello from agent');
  }, 30000);

  it('records exactly one usage row on completion (task wealth_chat)', async () => {
    const h = makeWealthHarness(deps());
    const r = await h.runChat({ message: 'hi', threadId: 'thread-x' });
    for await (const _ of r.textStream) { /* drain */ }
    await r.done;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      task: 'wealth_chat', providerId: 'p1', dialect: 'gemini',
      model: 'google/gemini-2.5-flash', inputTokens: 11, outputTokens: 7, ok: 1,
    });
    expect(inserted[0].costUsd).toBeCloseTo(11 / 1e6 * 1 + 7 / 1e6 * 2, 12);
  }, 30000);

  it('throws AgentConfigError (not_configured) when no route', async () => {
    const h = makeWealthHarness(deps(false));
    await expect(h.runChat({ message: 'hi' })).rejects.toBeInstanceOf(AgentConfigError);
  });

  it('surfaces an ask_user tool-call as a question event through the events stream', async () => {
    // A model whose fullStream contains an ask_user tool-call.
    const askModel = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: '' }],
        finishReason: 'tool-calls',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      } as any),
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            {
              type: 'tool-call',
              toolCallId: 'q1',
              toolName: 'ask_user',
              input: JSON.stringify({ question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] }),
            },
            { type: 'finish', finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
          ],
        }),
      }),
    } as any);

    const h = makeWealthHarness({ ...deps(), makeModel: () => askModel } as HarnessDeps);
    const r = await h.runChat({ message: 'should I prepay?', threadId: 'thread-q' });
    const collected: any[] = [];
    for await (const ev of r.events) collected.push(ev);
    await r.done;
    const q = collected.find((e) => e.type === 'question');
    expect(q).toBeTruthy();
    expect(q.question).toBe('Prepay or invest?');
    expect(q.options).toEqual([{ label: 'Prepay' }, { label: 'Invest' }]);
  }, 30000);
});
