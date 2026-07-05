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

  it('confirming one AI suggestion + creating its rule does NOT wipe unrelated ai_suggested rows', async () => {
    app = await buildServer({ dbPath: ':memory:', amfiMatch: noAmfi });
    // Two UNRELATED transactions, both left in the pending 'ai_suggested' state
    // (as a fresh AI run leaves them). Confirming one must not disturb the other.
    app.sqlite.prepare(
      `INSERT INTO transactions (transaction_date, description, normalized_description, amount, direction, category_id, category_source, ai_keyword, source_type, dedupe_key)
       VALUES ('2026-03-10','SWIGGY ORDER 999','swiggy order 999',250,'debit','food','ai_suggested','swiggy','manual','k1'),
              ('2026-03-12','UBER TRIP 42','uber trip 42',180,'debit','transport','ai_suggested','uber','manual','k2')`,
    ).run();
    const swiggy = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key='k1'").get() as { id: number };
    const uber = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key='k2'").get() as { id: number };

    // Confirm the swiggy suggestion AND create its keyword rule (the ✓ → Yes flow).
    const res = await app.inject({
      method: 'PATCH', url: `/transactions/${swiggy.id}/category`,
      payload: { categoryId: 'food', createRuleKeyword: true, keyword: 'swiggy' },
    });
    expect(res.statusCode).toBe(200);

    // The confirmed row is now manual and its pending ai_keyword is cleared.
    const t = app.sqlite.prepare('SELECT category_source, ai_keyword FROM transactions WHERE id=?').get(swiggy.id) as any;
    expect(t.category_source).toBe('manual');
    expect(t.ai_keyword).toBeNull();

    // The unrelated Uber row must STILL be its pending AI suggestion — keyword intact.
    const u = app.sqlite.prepare('SELECT category_id, category_source, ai_keyword FROM transactions WHERE id=?').get(uber.id) as any;
    expect(u.category_id).toBe('transport');
    expect(u.category_source).toBe('ai_suggested');
    expect(u.ai_keyword).toBe('uber');
  });
});
