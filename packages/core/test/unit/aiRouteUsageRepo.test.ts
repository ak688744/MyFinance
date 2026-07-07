// packages/core/test/unit/aiRouteUsageRepo.test.ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeAiProviderRepo } from '../../src/repositories/aiProviderRepo';
import { makeAiModelRepo } from '../../src/repositories/aiModelRepo';
import { makeAiTaskRouteRepo } from '../../src/repositories/aiTaskRouteRepo';
import { makeAiUsageRepo } from '../../src/repositories/aiUsageRepo';

function seedModel(db: any) {
  makeAiProviderRepo(db).create({ id: 'gemini', dialect: 'gemini', label: 'G', secretEnc: 'e', configJson: null });
  makeAiModelRepo(db).create({ id: 'flash', providerId: 'gemini', modelString: 'gemini-2.5-flash', label: 'Flash', inputPerM: 0.3, outputPerM: 2.5 });
}

describe('aiTaskRouteRepo', () => {
  it('upserts a route (insert then replace) and reads by task', () => {
    const { db } = runMigrations(':memory:');
    seedModel(db);
    const routes = makeAiTaskRouteRepo(db);
    routes.upsert('categorization', 'flash', '2026-07-07T00:00:00Z');
    expect(routes.getByTask('categorization')?.modelId).toBe('flash');
    routes.upsert('categorization', 'flash', '2026-07-08T00:00:00Z');
    expect(routes.list()).toHaveLength(1); // still one row
    routes.delete('categorization');
    expect(routes.getByTask('categorization')).toBeNull();
  });
});

describe('aiUsageRepo', () => {
  it('inserts events and aggregates summary by task/model/day + unpriced count', () => {
    const { db } = runMigrations(':memory:');
    const usage = makeAiUsageRepo(db);
    usage.insert({ ts: '2026-07-01T10:00:00Z', task: 'categorization', providerId: 'gemini', dialect: 'gemini', model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 500, callCount: 2, costUsd: 0.01, ok: 1 });
    usage.insert({ ts: '2026-07-01T12:00:00Z', task: 'categorization', providerId: 'gemini', dialect: 'gemini', model: 'gemini-2.5-flash', inputTokens: 2000, outputTokens: 0, callCount: 1, costUsd: null, ok: 1 });
    const s = usage.summary({});
    expect(s.callCount).toBe(2);
    expect(s.totalInput).toBe(3000);
    expect(s.totalCostUsd).toBeCloseTo(0.01);
    expect(s.unpricedCount).toBe(1);
    expect(s.byTask[0].task).toBe('categorization');
    expect(s.byDay[0].day).toBe('2026-07-01');
    expect(usage.listEvents({ limit: 10, offset: 0 })).toHaveLength(2);
    expect(usage.listEvents({ task: 'nope', limit: 10, offset: 0 })).toHaveLength(0);
  });
});
