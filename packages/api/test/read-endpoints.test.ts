import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server';

/**
 * Read-endpoint integration tests. Seeds a small fixture via raw app.sqlite
 * (foreign_keys is ON, so parent rows — categories, schemes — are inserted
 * before children). Schemes are seeded WITHOUT an amfi_code so the portfolio/
 * returns NAV path never fires — no live network in tests.
 */
describe('read endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ dbPath: ':memory:' });
    const db = app.sqlite;

    // --- expense side: a category + one transaction ---
    db.prepare(
      `INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)`,
    ).run('food', 'Food', null);

    db.prepare(
      `INSERT INTO transactions
        (transaction_date, description, normalized_description, amount,
         direction, category_id, category_source, source_type, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      '2025-01-15',
      'SWIGGY ORDER',
      'swiggy order',
      450.0,
      'debit',
      'food',
      'manual',
      'hdfc',
      'dedupe-1',
    );

    // --- investment side: scheme WITHOUT amfi_code (forces holdings/invested
    //     fallback in portfolio + returns math; no NAV network) ---
    const schemeId = db
      .prepare(
        `INSERT INTO investment_schemes (scheme_name, amfi_code, amc_name, category)
         VALUES (?, NULL, ?, ?)`,
      )
      .run('Test Equity Fund', 'TestAMC', 'equity').lastInsertRowid as number;

    // Two purchases for that scheme.
    const insTx = db.prepare(
      `INSERT INTO investment_transactions
        (scheme_id, account_name, investment_app, scheme_name,
         transaction_type, units, nav, amount, transaction_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insTx.run(schemeId, 'Vivek', 'groww', 'Test Equity Fund', 'PURCHASE', 100, 10, 1000, '2024-01-10');
    insTx.run(schemeId, 'Vivek', 'groww', 'Test Equity Fund', 'PURCHASE', 50, 12, 600, '2024-06-10');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /transactions returns rows in an envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/transactions?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(10);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].description).toBe('SWIGGY ORDER');
  });

  it('GET /investments/summary returns a summary (holdings/invested fallback, no network)', async () => {
    const res = await app.inject({ method: 'GET', url: '/investments/summary' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    // No amfi -> currentValue falls back to invested (Math.max(invested,0)).
    expect(body.data.totalInvested).toBeCloseTo(1600, 2);
    expect(body.data.totalCurrentValue).toBeCloseTo(1600, 2);
    expect(body.data.holdingsCount).toBe(1);
  });

  it('GET /investments/returns?period=ALL returns a returns object', async () => {
    const res = await app.inject({ method: 'GET', url: '/investments/returns?period=ALL' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.period).toBe('ALL');
    expect(body.data).toHaveProperty('xirr');
    expect(body.data).toHaveProperty('returns');
    expect(body.data).toHaveProperty('endValue');
  });

  it('GET /investments/returns?period=BOGUS is a 400 with an error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/investments/returns?period=BOGUS' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.error.statusCode).toBe(400);
    expect(typeof body.error.message).toBe('string');
  });
});
