import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';

describe('AI usage routes', () => {
  it('summary + events reflect inserted usage rows', async () => {
    const a = await buildServer({ dbPath: ':memory:' });
    // insert directly through the repo (bypassing an actual LLM call)
    a.repos.aiUsageRepo.insert({ ts: '2026-07-01T10:00:00Z', task: 'categorization', providerId: 'gemini', dialect: 'gemini', model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 500, callCount: 1, costUsd: 0.01, ok: 1 });
    const s = await a.inject({ method: 'GET', url: '/ai/usage/summary' });
    expect(s.json().data).toMatchObject({ callCount: 1, totalInput: 1000, unpricedCount: 0 });
    const e = await a.inject({ method: 'GET', url: '/ai/usage/events?limit=10&offset=0' });
    expect(e.json().data).toHaveLength(1);
    await a.close();
  });
});
