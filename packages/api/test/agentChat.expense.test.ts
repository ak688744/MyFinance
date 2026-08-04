import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server';

let app: any = null;
afterEach(async () => { await app?.close(); app = null; });

describe('POST /agent/chat agent field', () => {
  it('passes agent:"expense" through to harness.runChat', async () => {
    let seen: any = null;
    const fakeHarness = {
      async runChat(args: any) {
        seen = args;
        async function* events() {
          yield { type: 'text', text: 'ok' };
        }
        return {
          threadId: 't1',
          events: events(),
          textStream: (async function*(){})(),
          done: Promise.resolve({ threadId: 't1', usage: { inputTokens: 0, outputTokens: 0 } }),
        };
      },
    };
    app = await buildServer({ dbPath: ':memory:', harness: fakeHarness as any });
    await app.inject({
      method: 'POST',
      url: '/agent/chat',
      payload: { message: 'hi', agent: 'expense' },
    });
    expect(seen.agent).toBe('expense');
  });
});
