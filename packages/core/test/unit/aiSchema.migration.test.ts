// packages/core/test/unit/aiSchema.migration.test.ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('ai tables migration 0004', () => {
  it('creates the four ai_* tables and leaves categories intact', () => {
    const { sqlite } = runMigrations(':memory:');
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining([
      'ai_providers', 'ai_models', 'ai_task_routes', 'ai_usage_events', 'categories',
    ]));
    sqlite.close();
  });
});
