import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeWealthHarness, type HarnessDeps } from '../src/index';
import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';

describe('memory persists across turns in a thread', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wealth-mem-'));
  const memoryUrl = `file:${join(dir, 'memory.db')}`;

  let seenMessageCounts: number[] = [];
  function recordCount(opts: any) {
    const count = Array.isArray(opts?.prompt)
      ? opts.prompt.length
      : Array.isArray(opts?.messages)
        ? opts.messages.length
        : 0;
    seenMessageCounts.push(count);
  }
  function countingModel() {
    return new MockLanguageModelV4({
      doGenerate: async (opts: any) => {
        recordCount(opts);
        return {
          content: [{ type: 'text', text: `ack (${seenMessageCounts.at(-1)} msgs)` }],
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          warnings: [],
        } as any;
      },
      doStream: async (opts: any) => {
        recordCount(opts);
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-delta', id: '1', delta: `ack (${seenMessageCounts.at(-1)} msgs)` },
              { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
            ],
          }),
        };
      },
    } as any);
  }

  function deps(): HarnessDeps {
    return {
      routeRepo: { getByTask: () => ({ task: 'wealth_chat', modelId: 'm1', updatedAt: 't' }) } as any,
      modelRepo: { get: () => ({ id: 'm1', providerId: 'p1', modelString: 'gemini-2.5-flash', label: 'F', inputPerM: 0, outputPerM: 0, createdAt: 't' }) } as any,
      providerRepo: { get: () => ({ id: 'p1', dialect: 'gemini', label: 'G', secretEnc: 'ENC', configJson: null, createdAt: 't' }) } as any,
      decrypt: () => 'k',
      usageRepo: { insert: () => 1 },
      now: () => '2026-07-18T00:00:00.000Z',
      dbPath: ':memory:',
      memoryUrl,
      makeModel: () => countingModel(),
    } as HarnessDeps;
  }

  afterAll(() => { /* temp dir auto-cleaned by OS */ });

  it('turn 2 in the same thread sees more injected context than turn 1', async () => {
    seenMessageCounts = [];
    const h = makeWealthHarness(deps());
    const thread = 'persist-thread';

    const r1 = await h.runChat({ threadId: thread, message: 'My goal is to retire by 55.' });
    for await (const _ of r1.textStream) { /* drain */ }
    await r1.done;
    const turn1Count = seenMessageCounts[0] ?? 0;
    seenMessageCounts = [];

    const r2 = await h.runChat({ threadId: thread, message: 'What did I say my goal was?' });
    for await (const _ of r2.textStream) { /* drain */ }
    await r2.done;

    expect(seenMessageCounts.length).toBeGreaterThan(0);
    expect(seenMessageCounts[0]).toBeGreaterThan(turn1Count);
  }, 40000);
});
