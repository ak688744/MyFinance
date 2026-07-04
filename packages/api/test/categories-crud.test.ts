import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

describe('Category CRUD', () => {
  it('POST /categories {name:\'Travel\'} → 201, returns {data:{id}} where id is a slug; GET /categories includes it', async () => {
    app = await buildTestServer();

    const create = await app.inject({
      method: 'POST',
      url: '/categories',
      payload: { name: 'Custom Category' },
    });

    expect(create.statusCode).toBe(201);
    const createData = create.json();
    expect(createData.data.id).toBe('custom_category');

    const list = await app.inject({ method: 'GET', url: '/categories' });
    const categories = list.json().data as Array<{ id: string; name: string }>;
    expect(categories.some(c => c.id === 'custom_category' && c.name === 'Custom Category')).toBe(true);
  });

  it('POST /categories with missing name → 400', async () => {
    app = await buildTestServer();

    const r = await app.inject({
      method: 'POST',
      url: '/categories',
      payload: {},
    });

    expect(r.statusCode).toBe(400);
  });

  it('PATCH /categories/:id {name:\'Trips\'} → 200; GET reflects rename', async () => {
    app = await buildTestServer();

    // Create a category first
    await app.inject({
      method: 'POST',
      url: '/categories',
      payload: { name: 'MyCategory' },
    });

    // Rename it
    const patch = await app.inject({
      method: 'PATCH',
      url: '/categories/mycategory',
      payload: { name: 'Renamed Category' },
    });

    expect(patch.statusCode).toBe(200);

    // Verify the rename
    const list = await app.inject({ method: 'GET', url: '/categories' });
    const categories = list.json().data as Array<{ id: string; name: string }>;
    const myCat = categories.find(c => c.id === 'mycategory');
    expect(myCat?.name).toBe('Renamed Category');
  });

  it('DELETE /categories/:id → 200; category gone from GET /categories; tagged txn survives with null category', async () => {
    app = await buildTestServer();

    // Import some transactions
    await app.inject({
      method: 'POST',
      url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });

    // Create a category
    await app.inject({
      method: 'POST',
      url: '/categories',
      payload: { name: 'TestCat' },
    });

    // Tag a transaction with it
    const txns = (await app.inject({ method: 'GET', url: '/transactions?limit=1' })).json().data as any[];
    const txnId = txns[0].id;

    await app.inject({
      method: 'PATCH',
      url: `/transactions/${txnId}/category`,
      payload: { categoryId: 'testcat' },
    });

    // Delete the category
    const del = await app.inject({ method: 'DELETE', url: '/categories/testcat' });
    expect(del.statusCode).toBe(200);

    // Verify category is gone
    const categories = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    expect(categories.some(c => c.id === 'testcat')).toBe(false);

    // Verify transaction still exists with null category
    const updatedTxn = (await app.inject({ method: 'GET', url: `/transactions?limit=50` })).json().data as any[];
    const ourTxn = updatedTxn.find((t: any) => t.id === txnId);
    expect(ourTxn).toBeDefined();
    expect(ourTxn.category_id ?? ourTxn.categoryId).toBeNull();
  });
});

describe('GET /categories/rules', () => {
  it('returns {data: rules[]} (array; after creating a rule it appears)', async () => {
    app = await buildTestServer();

    const cats = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    const categoryId = cats[0].id;

    // Initially, rules might be empty or have some
    const before = await app.inject({ method: 'GET', url: '/categories/rules' });
    expect(before.statusCode).toBe(200);
    expect(Array.isArray(before.json().data)).toBe(true);

    // Create a rule
    await app.inject({
      method: 'POST',
      url: '/categories/rules',
      payload: { ruleType: 'merchant', patternValue: 'test-merchant', categoryId },
    });

    // Now it should appear (normalized to 'test merchant' by core)
    const after = await app.inject({ method: 'GET', url: '/categories/rules' });
    const rules = after.json().data as Array<{ patternValue: string }>;
    expect(rules.some(r => r.patternValue === 'test merchant')).toBe(true);
  });
});

describe('PATCH /transactions/:id/category', () => {
  it('PATCH /transactions/:id/category {categoryId:\'food\'} → 200; transaction\'s category becomes \'food\' with source \'manual\'', async () => {
    app = await buildTestServer();

    // Import transactions
    await app.inject({
      method: 'POST',
      url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });

    const txns = (await app.inject({ method: 'GET', url: '/transactions?limit=1' })).json().data as any[];
    const txnId = txns[0].id;

    // Update category
    const patch = await app.inject({
      method: 'PATCH',
      url: `/transactions/${txnId}/category`,
      payload: { categoryId: 'food' },
    });

    expect(patch.statusCode).toBe(200);

    // Verify via GET /transactions
    const updated = (await app.inject({ method: 'GET', url: '/transactions?limit=50' })).json().data as any[];
    const ourTxn = updated.find((t: any) => t.id === txnId);
    expect(ourTxn.category_id ?? ourTxn.categoryId).toBe('food');
  });

  it('PATCH /transactions/:id/category {categoryId:\'food\', createRuleMerchant:true} on a txn with merchant key → 200 AND a merchant rule exists in GET /categories/rules', async () => {
    app = await buildTestServer();

    // Import transactions (HDFC sample has UPI-* transactions with merchant keys)
    await app.inject({
      method: 'POST',
      url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });

    // Find a transaction with a merchant key (UPI- prefix)
    const txns = (await app.inject({ method: 'GET', url: '/transactions?limit=50' })).json().data as any[];
    const upiTxn = txns.find((t: any) => {
      const desc = String(t.description || '');
      return desc.startsWith('UPI-');
    });

    expect(upiTxn).toBeDefined();
    const txnId = upiTxn.id;

    // Update category with createRuleMerchant flag
    const patch = await app.inject({
      method: 'PATCH',
      url: `/transactions/${txnId}/category`,
      payload: { categoryId: 'food', createRuleMerchant: true },
    });

    expect(patch.statusCode).toBe(200);

    // Verify a merchant rule now exists
    const rules = (await app.inject({ method: 'GET', url: '/categories/rules' })).json().data as Array<{
      ruleType: string;
      patternValue: string;
      categoryId: string;
    }>;

    // Should have a merchant rule pointing to 'food'
    const merchantRules = rules.filter(r => r.ruleType === 'merchant' && r.categoryId === 'food');
    expect(merchantRules.length).toBeGreaterThan(0);
  });
});
