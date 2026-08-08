import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';
import type { Gateway } from '../src/plugins/gateway';

function fakeGateway(json: string): Gateway {
  return {
    async runTask<T>(_task: string, fn: (complete: any) => Promise<T>): Promise<T> {
      const complete = async () => ({ text: json, usage: { inputTokens: 1, outputTokens: 1 } });
      return fn(complete);
    },
  } as unknown as Gateway;
}

function multipart(fields: Record<string, string>, file?: { name: string; content: Buffer }) {
  const boundary = '----t' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/pdf\r\n\r\n`));
    chunks.push(file.content);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const statement = JSON.stringify({
  lineItems: [
    { date: '2026-06-02', merchant: 'SWIGGY', amount: 500 },
    { date: '2026-06-05', merchant: 'AMAZON', amount: 1500 },
  ],
  detectedTotal: 2000,
});

describe('POST /transactions/:id/split-from-statement', () => {
  it('splits a bill into categorized children and reconciles', async () => {
    const app = await buildServer({ dbPath: ':memory:', gateway: fakeGateway(statement) });
    const created = await app.inject({ method: 'POST', url: '/transactions', payload: { transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT', amount: 8000, direction: 'debit', categoryId: 'credit_card_bill' } });
    const parentId = created.json().data.id;

    const { makeSimplePdf } = await import('./fixtures/makePdf');
    const pdf = Buffer.from(new Uint8Array(makeSimplePdf('anything')));
    const mp = multipart({}, { name: 'stmt.pdf', content: pdf });
    const res = await app.inject({ method: 'POST', url: `/transactions/${parentId}/split-from-statement`, payload: mp.payload, headers: mp.headers });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.children).toHaveLength(2);
    expect(d.parsedTotal).toBe(2000);
    expect(d.matched).toBe(true);
    expect(d.carryover).toBe(6000);

    const sum = await app.inject({ method: 'GET', url: '/expenses/summary?from=2026-06-01&to=2026-06-30' });
    expect(sum.json().data.totalSpent).toBe(2000);
    await app.close();
  });

  it('404 when the parent does not exist', async () => {
    const app = await buildServer({ dbPath: ':memory:', gateway: fakeGateway(statement) });
    const { makeSimplePdf } = await import('./fixtures/makePdf');
    const pdf = Buffer.from(new Uint8Array(makeSimplePdf('x')));
    const mp = multipart({}, { name: 'stmt.pdf', content: pdf });
    const res = await app.inject({ method: 'POST', url: '/transactions/99999/split-from-statement', payload: mp.payload, headers: mp.headers });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('409 when the parent is already split', async () => {
    const app = await buildServer({ dbPath: ':memory:', gateway: fakeGateway(statement) });
    const created = await app.inject({ method: 'POST', url: '/transactions', payload: { transactionDate: '2026-06-15', description: 'CC', amount: 8000, direction: 'debit' } });
    const parentId = created.json().data.id;
    const { makeSimplePdf } = await import('./fixtures/makePdf');
    const pdf = Buffer.from(new Uint8Array(makeSimplePdf('x')));
    const mp = multipart({}, { name: 'a.pdf', content: pdf });
    const first = await app.inject({ method: 'POST', url: `/transactions/${parentId}/split-from-statement`, payload: mp.payload, headers: mp.headers });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: `/transactions/${parentId}/split-from-statement`, payload: mp.payload, headers: mp.headers });
    expect(second.statusCode).toBe(409);
    await app.close();
  });

  it('400 when no file is uploaded', async () => {
    const app = await buildServer({ dbPath: ':memory:', gateway: fakeGateway(statement) });
    const created = await app.inject({ method: 'POST', url: '/transactions', payload: { transactionDate: '2026-06-15', description: 'CC', amount: 8000, direction: 'debit' } });
    const parentId = created.json().data.id;
    const mp = multipart({ password: 'x' });
    const res = await app.inject({ method: 'POST', url: `/transactions/${parentId}/split-from-statement`, payload: mp.payload, headers: mp.headers });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
