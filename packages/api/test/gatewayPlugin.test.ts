import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';

describe('gateway wiring', () => {
  it('decorates repos with the 4 AI repos', async () => {
    const app = await buildServer({ dbPath: ':memory:' });
    expect(app.repos.aiProviderRepo).toBeTruthy();
    expect(app.repos.aiModelRepo).toBeTruthy();
    expect(app.repos.aiTaskRouteRepo).toBeTruthy();
    expect(app.repos.aiUsageRepo).toBeTruthy();
    await app.close();
  });
});
