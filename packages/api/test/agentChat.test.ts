import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import { AgentConfigError } from '@myfinance/agent-harness';

let app: any = null;
afterEach(async () => { await app?.close(); app = null; });

function fakeHarness(behavior: 'ok' | 'unconfigured') {
  return {
    async runChat(_args: { threadId?: string; message: string }) {
      if (behavior === 'unconfigured') {
        throw new AgentConfigError('not_configured', 'Configure a model for the wealth agent in AI Settings.');
      }
      async function* events() {
        yield { type: 'text', text: 'Hello ' };
        yield { type: 'step', label: 'Checking net worth' };
        yield { type: 'text', text: 'world' };
      }
      async function* textOnly() { yield 'Hello '; yield 'world'; }
      return {
        threadId: 'thread-abc',
        events: events(),
        textStream: textOnly(),
        done: Promise.resolve({ usage: { inputTokens: 5, outputTokens: 2 }, threadId: 'thread-abc' }),
      };
    },
  };
}

describe('POST /agent/chat', () => {
  it('streams tokens then a done event', async () => {
    app = await buildServer({ dbPath: ':memory:', harness: fakeHarness('ok') as any });
    const res = await app.inject({
      method: 'POST', url: '/agent/chat',
      payload: { message: 'hi' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('"type":"token"');
    expect(res.body).toContain('Hello');
    expect(res.body).toContain('world');
    expect(res.body).toContain('"type":"step"');
    expect(res.body).toContain('Checking net worth');
    expect(res.body).toContain('"type":"done"');
    expect(res.body).toContain('thread-abc');
  });

  it('emits an error event when the agent is not configured', async () => {
    app = await buildServer({ dbPath: ':memory:', harness: fakeHarness('unconfigured') as any });
    const res = await app.inject({
      method: 'POST', url: '/agent/chat',
      payload: { message: 'hi' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.body).toContain('"type":"error"');
    expect(res.body).toContain('AI Settings');
  });

  it('rejects an empty message with 400', async () => {
    app = await buildServer({ dbPath: ':memory:', harness: fakeHarness('ok') as any });
    const res = await app.inject({
      method: 'POST', url: '/agent/chat',
      payload: { message: '' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});
