import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server';

const noAmfi = async () => ({ matched: 0, total: 0 });

describe('PATCH /transactions/:id/category — keyword rule', () => {
  let app: Awaited<ReturnType<typeof buildServer>> | null = null;
  afterEach(async () => { await app?.close(); app = null; });

  it('creates a keyword rule and recategorizes a sibling', async () => {
    app = await buildServer({ dbPath: ':memory:', amfiMatch: noAmfi });
    // target txn + a sibling sharing the "swiggy" token, both uncategorized
    app.sqlite.prepare(
      `INSERT INTO transactions (transaction_date, description, normalized_description, amount, direction, source_type, dedupe_key)
       VALUES ('2026-03-10','SWIGGY ORDER 999','swiggy order 999',250,'debit','manual','k1'),
              ('2026-03-11','SWIGGY ORDER 111','swiggy order 111',120,'debit','manual','k2')`,
    ).run();
    const target = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key='k1'").get() as { id: number };
    const sibling = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key='k2'").get() as { id: number };

    const res = await app.inject({
      method: 'PATCH', url: `/transactions/${target.id}/category`,
      payload: { categoryId: 'food', createRuleKeyword: true, keyword: 'swiggy' },
    });
    expect(res.statusCode).toBe(200);

    const t = app.sqlite.prepare('SELECT category_id, category_source FROM transactions WHERE id=?').get(target.id) as any;
    const s = app.sqlite.prepare('SELECT category_id, category_source FROM transactions WHERE id=?').get(sibling.id) as any;
    expect(t.category_id).toBe('food');
    expect(t.category_source).toBe('manual');       // the one-off assign wins on the target
    expect(s.category_id).toBe('food');             // sibling caught by the new keyword rule
    expect(s.category_source).toBe('keyword_rule');
  });
});
