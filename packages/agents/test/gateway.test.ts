import { describe, it, expect } from 'vitest';
import { makeLlmGateway } from '../src/gateway';
import { LlmError } from '../src/llm/types';

function fakeRepos(overrides: any = {}) {
  const inserted: any[] = [];
  return {
    inserted,
    deps: {
      routeRepo: { getByTask: (t: string) => (t === 'categorization' ? { task: t, modelId: 'flash', updatedAt: '' } : null), list: () => [], upsert() {}, delete() {} },
      modelRepo: { get: (id: string) => (id === 'flash' ? { id, providerId: 'gemini', modelString: 'gemini-2.5-flash', label: 'F', inputPerM: 0.3, outputPerM: 2.5, createdAt: '' } : null), list: () => [], create() {}, update() {}, delete() {}, countRoutes: () => 0 },
      providerRepo: { get: (id: string) => (id === 'gemini' ? { id, dialect: 'gemini', label: 'G', secretEnc: 'ENC', configJson: null, createdAt: '' } : null), list: () => [], create() {}, update() {}, delete() {}, countModels: () => 0 },
      usageRepo: { insert: (e: any) => { inserted.push(e); return inserted.length; }, listEvents: () => [], summary: () => ({} as any) },
      decrypt: (_blob: string) => 'decrypted-key',
      now: () => '2026-07-07T00:00:00Z',
      ...overrides,
    },
  };
}

describe('LlmGateway.runTask', () => {
  it('resolves route→model→provider, runs fn, writes ONE aggregated usage row', async () => {
    const { deps, inserted } = fakeRepos();
    const gw = makeLlmGateway(deps as any);
    const result = await gw.runTask('categorization', async (complete) => {
      // simulate two internal calls (fn does NOT actually hit network — buildProvider
      // returns a gemini provider, but we override by asserting only usage aggregation)
      return 'done';
    });
    expect(result).toBe('done');
    // no complete() calls → still records a zero-usage ok row
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ task: 'categorization', model: 'gemini-2.5-flash', providerId: 'gemini', ok: 1, callCount: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('aggregates usage + computes frozen cost across calls', async () => {
    const { deps, inserted } = fakeRepos();
    // stub provider by making complete resolve without network: we monkeypatch via a fake
    // provider through decrypt path is complex; instead assert the accumulator using a
    // gateway-level injected completeFactory is out of scope — we validate cost math by
    // having fn call the provided complete twice against a fake provider.
    const gw = makeLlmGateway({ ...deps, buildProvider: () => ({ complete: async () => ({ text: '[]', usage: { inputTokens: 1000, outputTokens: 500 } }) }) } as any);
    await gw.runTask('categorization', async (complete) => {
      await complete({ prompt: 'a', jsonSchema: {} });
      await complete({ prompt: 'b', jsonSchema: {} });
      return null;
    });
    const row = inserted[0];
    expect(row.callCount).toBe(2);
    expect(row.inputTokens).toBe(2000);
    expect(row.outputTokens).toBe(1000);
    // cost = 2000/1e6*0.3 + 1000/1e6*2.5 = 0.0006 + 0.0025 = 0.0031
    expect(row.costUsd).toBeCloseTo(0.0031);
  });

  it('throws provider_not_configured when the task has no route (no usage row)', async () => {
    const { deps, inserted } = fakeRepos({ routeRepo: { getByTask: () => null, list: () => [], upsert() {}, delete() {} } });
    const gw = makeLlmGateway(deps as any);
    await expect(gw.runTask('categorization', async () => 'x')).rejects.toBeInstanceOf(LlmError);
    expect(inserted).toHaveLength(0);
  });

  it('records ok=0 and re-throws when fn throws after usage accrued', async () => {
    const { deps, inserted } = fakeRepos();
    const gw = makeLlmGateway({ ...deps, buildProvider: () => ({ complete: async () => ({ text: '[]', usage: { inputTokens: 100, outputTokens: 0 } }) }) } as any);
    await expect(gw.runTask('categorization', async (complete) => {
      await complete({ prompt: 'a', jsonSchema: {} });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(inserted[0]).toMatchObject({ ok: 0, inputTokens: 100, callCount: 1 });
  });
});
