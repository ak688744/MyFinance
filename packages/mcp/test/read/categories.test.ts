import { describe, it, expect } from 'vitest';
import { buildContext } from '../../src/context';
import { runListCategories } from '../../src/tools/read/categories';

describe('list_categories', () => {
  it('returns seeded categories', async () => {
    const ctx = buildContext({ dbPath: ':memory:' });
    const res = await runListCategories(ctx);
    const payload = JSON.parse(res.content[0].text as string);
    expect(Array.isArray(payload.categories)).toBe(true);
    expect(payload.categories.length).toBeGreaterThan(0);
    expect(payload.categories[0]).toHaveProperty('id');
    ctx.close();
  });
});
