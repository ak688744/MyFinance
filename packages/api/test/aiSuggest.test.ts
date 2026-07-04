import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import type { LlmProvider } from '@myfinance/agents';

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

describe('POST /categories/ai-suggest', () => {
  let app: Awaited<ReturnType<typeof buildServer>> | null = null;
  afterEach(async () => { await app?.close(); app = null; });

  it('applies AI suggestions as ai_suggested and returns them', async () => {
    app = await buildServer({
      dbPath: ':memory:', amfiMatch: noAmfi,
      llmProvider: echoingProvider('food', 'swiggy'),
    });
    seedUncategorized(app);
    const row = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key = 'k-swiggy-1'").get() as { id: number };

    const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-03-01', to: '2026-03-31' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.counts.total).toBe(1);
    expect(body.data.suggestions.length).toBeGreaterThan(0);

    // The applied row now carries category_source = 'ai_suggested'
    const after = app.sqlite.prepare('SELECT category_id, category_source FROM transactions WHERE id = ?').get(row.id) as any;
    expect(after.category_source).toBe('ai_suggested');
    expect(after.category_id).toBe('food');
  });

  it('returns 400 when no provider is configured', async () => {
    // Ensure GEMINI_API_KEY is not in the environment
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      app = await buildServer({ dbPath: ':memory:', amfiMatch: noAmfi }); // no llmProvider, no env key
      const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-03-01', to: '2026-03-31' } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain('AI provider not configured');
    } finally {
      if (savedKey !== undefined) {
        process.env.GEMINI_API_KEY = savedKey;
      }
    }
  });

  it('returns empty result when the month has no uncategorized txns', async () => {
    app = await buildServer({ dbPath: ':memory:', amfiMatch: noAmfi, llmProvider: echoingProvider('food', 'swiggy') });
    const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-05-01', to: '2026-05-31' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counts.total).toBe(0);
  });
});
