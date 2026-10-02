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
        yield { type: 'question', question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] };
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

  it('emits a question SSE frame with option labels', async () => {
    app = await buildServer({ dbPath: ':memory:', harness: fakeHarness('ok') as any });
    const res = await app.inject({
      method: 'POST', url: '/agent/chat',
      payload: { message: 'should I prepay?' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"type":"question"');
    expect(res.body).toContain('Prepay or invest?');
    expect(res.body).toContain('Prepay');
    expect(res.body).toContain('Invest');
  });
});

describe('GET /agent/threads', () => {
  function threadHarness() {
    const calls: any[] = [];
    return {
      calls,
      async listThreads(a: any) { calls.push(['list', a]); return [{ id: 't1', title: 'Hi', snippet: 'yo', createdAt: 'c', updatedAt: 'u' }]; },
      async getThread(a: any) {
        calls.push(['get', a]);
        return a.threadId === 't1' ? { id: 't1', title: 'Hi', messages: [{ role: 'user', text: 'Hi' }] } : null;
      },
    };
  }

  it('lists threads with default agent and clamped limit', async () => {
    const h = threadHarness();
    app = await buildServer({ dbPath: ':memory:', harness: h as any });
    const res = await app.inject({ method: 'GET', url: '/agent/threads?limit=500' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].id).toBe('t1');
    expect(h.calls[0][1]).toEqual({ agent: 'wealth', limit: 100 });
    await app.inject({ method: 'GET', url: '/agent/threads?agent=expense' });
    expect(h.calls[1][1]).toEqual({ agent: 'expense', limit: 30 });
  });

  it('rejects an invalid agent with 400', async () => {
    app = await buildServer({ dbPath: ':memory:', harness: threadHarness() as any });
    expect((await app.inject({ method: 'GET', url: '/agent/threads?agent=bogus' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/agent/threads/t1?agent=bogus' })).statusCode).toBe(400);
  });

  it('returns a thread, or 404 when missing', async () => {
    app = await buildServer({ dbPath: ':memory:', harness: threadHarness() as any });
    const ok = await app.inject({ method: 'GET', url: '/agent/threads/t1?agent=expense' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data).toEqual({ id: 't1', title: 'Hi', messages: [{ role: 'user', text: 'Hi' }] });
    expect((await app.inject({ method: 'GET', url: '/agent/threads/zzz' })).statusCode).toBe(404);
  });
});
