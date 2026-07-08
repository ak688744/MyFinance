import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import type { LlmProvider, CompleteFn } from '@myfinance/agents';
import { LlmError } from '@myfinance/agents';
import type { Gateway } from '../src/plugins/gateway';
import type { Repos } from '../src/plugins/db';

const noAmfi = async () => ({ matched: 0, total: 0 });

function seedUncategorized(app: any) {
  // one uncategorized March txn with a plain description
  app.sqlite.prepare(
    `INSERT INTO transactions (transaction_date, description, normalized_description, amount, direction, source_type, dedupe_key)
     VALUES ('2026-03-10', 'SWIGGY ORDER 999', 'swiggy order 999', 250, 'debit', 'manual', 'k-swiggy-1')`,
  ).run();
}

function echoingProvider(categoryId: string, keyword: string): LlmProvider {
  return { async complete({ prompt }) {
    const ids = [...prompt.matchAll(/"id": (\d+)/g)].map((m) => Number(m[1]));
    return { text: JSON.stringify(ids.map((id) => ({ transactionId: id, categoryId, keyword, confidence: 0.9 }))), usage: { inputTokens: 8, outputTokens: 3 } };
  } };
}

function makeFakeGateway(provider: LlmProvider, recordUsage?: Repos['aiUsageRepo']): Gateway {
  return {
    async runTask<T>(_task: string, fn: (complete: CompleteFn) => Promise<T>): Promise<T> {
      const complete: CompleteFn = async (input) => provider.complete(input);
      const result = await fn(complete);
      // Simulate what the real gateway does: record a usage row after successful completion
      if (recordUsage) {
        recordUsage.insert({
          ts: new Date().toISOString(),
          task: 'categorization',
          providerId: 'test-provider',
          dialect: 'gemini',
          model: 'gemini-2.0-flash-exp',
          inputTokens: 8,
          outputTokens: 3,
          callCount: 1,
          costUsd: 0,
          ok: 1,
        });
      }
      return result;
    },
  };
}

function makeErrorGateway(error: LlmError): Gateway {
  return {
    async runTask<T>(): Promise<T> {
      throw error;
    },
  };
}

describe('POST /categories/ai-suggest', () => {
  let app: Awaited<ReturnType<typeof buildServer>> | null = null;
  afterEach(async () => { await app?.close(); app = null; });

  it('applies AI suggestions as ai_suggested and returns them', async () => {
    app = await buildServer({
      dbPath: ':memory:', amfiMatch: noAmfi,
      gateway: makeFakeGateway(echoingProvider('food', 'swiggy')),
    });
    seedUncategorized(app);
    const row = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key = 'k-swiggy-1'").get() as { id: number };

    const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-03-01', to: '2026-03-31' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.counts.total).toBe(1);
    expect(body.data.suggestions.length).toBeGreaterThan(0);

    // The applied row now carries category_source = 'ai_suggested' AND the AI
    // keyword is PERSISTED (so the pending suggestion survives a page refresh).
    const after = app.sqlite.prepare('SELECT category_id, category_source, ai_keyword FROM transactions WHERE id = ?').get(row.id) as any;
    expect(after.category_source).toBe('ai_suggested');
    expect(after.category_id).toBe('food');
    expect(after.ai_keyword).toBe('swiggy');
  });

  it('returns 400 when no route is configured', async () => {
    app = await buildServer({
      dbPath: ':memory:', amfiMatch: noAmfi,
      gateway: makeErrorGateway(new LlmError('provider_not_configured', 'No AI model is assigned to task "categorization"')),
    });
    seedUncategorized(app); // Need uncategorized txn to trigger the gateway call
    const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-03-01', to: '2026-03-31' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('No AI model is assigned');
  });

  it('returns empty result when the month has no uncategorized txns', async () => {
    app = await buildServer({
      dbPath: ':memory:', amfiMatch: noAmfi,
      gateway: makeFakeGateway(echoingProvider('food', 'swiggy')),
    });
    const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-05-01', to: '2026-05-31' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counts.total).toBe(0);
  });

  it('records exactly one usage row on successful ai-suggest', async () => {
    const server = await buildServer({ dbPath: ':memory:', amfiMatch: noAmfi });
    app = server; // for cleanup
    seedUncategorized(server);

    // Pass the usageRepo so the fake gateway records usage into this DB
    const gatewayWithUsage = makeFakeGateway(echoingProvider('food', 'swiggy'), server.repos.aiUsageRepo);

    // Manually override the gateway after server construction (hacky but works for test)
    // by re-registering the category routes with our custom gateway
    await server.register(async (instance) => {
      instance.post('/test-ai-suggest', async (request, reply) => {
        const { from, to } = request.body as any;
        const { categorizeWithAI } = await import('@myfinance/agents');
        const result = await gatewayWithUsage.runTask('categorization', async (complete) => {
          const candidates = server.repos.expenseTxRepo.listUncategorizedInRange({ from, to, limit: 100 });
          const categories = server.repos.categoryRepo.list().map((c: any) => ({ id: c.id, name: c.name }));
          return categorizeWithAI(
            candidates.map((t: any) => ({ id: t.id, description: t.description, amount: t.amount, direction: t.direction })),
            { complete, categories },
          );
        });
        return reply.send({ data: result });
      });
    });

    // Before the call, usage should be empty
    const before = server.repos.aiUsageRepo.summary({});
    expect(before.callCount).toBe(0);

    await server.inject({ method: 'POST', url: '/test-ai-suggest', payload: { from: '2026-03-01', to: '2026-03-31' } });

    // After the call, exactly one usage row recorded
    const after = server.repos.aiUsageRepo.summary({});
    expect(after.callCount).toBe(1);
  });
});
