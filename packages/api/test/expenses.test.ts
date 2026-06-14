import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server';

describe('expense reads', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ dbPath: ':memory:' });
    const db = app.sqlite;

    // Seed categories (registerDb already seeds starter categories, so use INSERT OR IGNORE)
    db.prepare(`INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?,?,?)`).run('food', 'Food', null);
    db.prepare(`INSERT OR IGNORE INTO categories (id, name, icon) VALUES (?,?,?)`).run('salary', 'Salary', null);

    // Seed expense transactions
    const ins = db.prepare(
      `INSERT INTO transactions
        (transaction_date, description, normalized_description, amount, direction,
         category_id, category_source, source_type, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    ins.run('2025-01-10', 'SWIGGY', 'swiggy', 450, 'debit', 'food', 'manual', 'hdfc', 'd1');
    ins.run('2025-02-01', 'ACME SALARY', 'acme salary', 100000, 'credit', 'salary', 'manual', 'hdfc', 'd2');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /expenses returns rows', async () => {
    const res = await app.inject({ method: 'GET', url: '/expenses' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(2);
  });

  it('GET /expenses?direction=in filters credits', async () => {
    const res = await app.inject({ method: 'GET', url: '/expenses?direction=in' });
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].direction).toBe('credit');
  });

  it('GET /expenses/summary computes totals', async () => {
    const res = await app.inject({ method: 'GET', url: '/expenses/summary' });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.totalSpent).toBe(450);
    expect(d.totalIncome).toBe(100000);
    expect(d.saved).toBe(99550);
    expect(d.byCategory.find((c: any) => c.categoryId === 'food').amount).toBe(450);
    expect(d.byMonth.find((m: any) => m.month === '2025-01').spent).toBe(450);
  });
});
