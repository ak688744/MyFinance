import { describe, it, expect } from 'vitest';
import { makeHarness, memoryUrlFor } from '../src/plugins/harness';

describe('harness plugin wiring', () => {
  it('derives a separate memory url beside the core db', () => {
    expect(memoryUrlFor('myfinance.db')).toBe('file:myfinance.db.memory.db');
    expect(memoryUrlFor(':memory:')).toBe(':memory:');
  });

  it('builds a harness object exposing runChat', () => {
    const fakeRepos: any = {
      aiTaskRouteRepo: { getByTask: () => null },
      aiModelRepo: { get: () => null },
      aiProviderRepo: { get: () => null },
      aiUsageRepo: { insert: () => 1 },
    };
    const h = makeHarness(fakeRepos, { dbPath: ':memory:', memoryUrl: ':memory:' });
    expect(typeof h.runChat).toBe('function');
  });
});
