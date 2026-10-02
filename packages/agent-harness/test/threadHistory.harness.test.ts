import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeWealthHarness } from '../src/runChat';
import { buildWealthMemory } from '../src/memory';

const dir = mkdtempSync(join(tmpdir(), 'hist-'));
const memoryUrl = `file:${join(dir, 'mem.db')}`;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const harness = makeWealthHarness({
  routeRepo: {} as any, modelRepo: {} as any, providerRepo: {} as any,
  decrypt: () => '', usageRepo: { insert: () => 1 }, dbPath: ':memory:', memoryUrl,
});

async function seed(threadId: string, resourceId: string, n: number) {
  const m: any = buildWealthMemory({ storeUrl: memoryUrl });
  await m.createThread({ threadId, resourceId });
  const messages = Array.from({ length: n }, (_, i) => ({
    id: `${threadId}-${i}`, role: i % 2 ? 'assistant' : 'user', createdAt: new Date(2026, 0, 1, 0, i),
    threadId, resourceId, content: { format: 2, parts: [{ type: 'text', text: `${i % 2 ? 'answer' : 'question'} ${i}` }] },
  }));
  await m.saveMessages({ messages, memoryConfig: { semanticRecall: false } });
}

describe('thread history on the harness', () => {
  it('lists and fetches whole threads (beyond lastMessages=20), scoped by agent', async () => {
    await seed('w1', 'user', 30);
    await seed('e1', 'expense-agent', 2);
    const wealth = await harness.listThreads({ agent: 'wealth' });
    expect(wealth.map((t) => t.id)).toEqual(['w1']);
    expect(wealth[0].title).toBe('question 0');
    expect(wealth[0].snippet).toBe('answer 29');
    const expense = await harness.listThreads({ agent: 'expense' });
    expect(expense.map((t) => t.id)).toEqual(['e1']);

    const t = await harness.getThread({ agent: 'wealth', threadId: 'w1' });
    expect(t!.messages).toHaveLength(30);
  });

  it('returns null for missing thread or resource mismatch', async () => {
    expect(await harness.getThread({ agent: 'wealth', threadId: 'nope' })).toBeNull();
    expect(await harness.getThread({ agent: 'expense', threadId: 'w1' })).toBeNull();
    expect(await harness.getThread({ agent: 'wealth', threadId: 'e1' })).toBeNull();
  });
});
