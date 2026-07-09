// packages/api/test/aiSettings.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server';

const KEY = '0'.repeat(64);
beforeAll(() => { process.env.MYFINANCE_SECRET_KEY = KEY; });

async function app() { return buildServer({ dbPath: ':memory:' }); }

describe('AI settings routes', () => {
  it('creates a provider without echoing the secret', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'gemini', dialect: 'gemini', label: 'Gemini', apiKey: 'sk-secret' } });
    expect(res.statusCode).toBe(201);
    const list = await a.inject({ method: 'GET', url: '/ai/providers' });
    const body = list.json().data;
    expect(body[0]).toMatchObject({ id: 'gemini', hasSecret: true });
    expect(JSON.stringify(body)).not.toContain('sk-secret');
    await a.close();
  });

  it('creates a model with prices, then routes a task to it', async () => {
    const a = await app();
    await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'gemini', dialect: 'gemini', label: 'G', apiKey: 'k' } });
    const m = await a.inject({ method: 'POST', url: '/ai/models', payload: { id: 'flash', providerId: 'gemini', modelString: 'gemini-2.5-flash', label: 'Flash', inputPerM: 0.3, outputPerM: 2.5 } });
    expect(m.statusCode).toBe(201);
    const route = await a.inject({ method: 'PUT', url: '/ai/tasks/categorization/route', payload: { modelId: 'flash' } });
    expect(route.statusCode).toBe(200);
    const tasks = await a.inject({ method: 'GET', url: '/ai/tasks' });
    const cat = tasks.json().data.find((t: any) => t.task === 'categorization');
    expect(cat).toMatchObject({ configured: true, assignedModelId: 'flash', label: expect.any(String) });
    await a.close();
  });

  it('rejects routing an unknown task (400) and blocks deleting a referenced model/provider (409)', async () => {
    const a = await app();
    await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'g', dialect: 'gemini', label: 'G', apiKey: 'k' } });
    await a.inject({ method: 'POST', url: '/ai/models', payload: { id: 'flash', providerId: 'g', modelString: 'x', label: 'F', inputPerM: 0, outputPerM: 0 } });
    await a.inject({ method: 'PUT', url: '/ai/tasks/categorization/route', payload: { modelId: 'flash' } });
    expect((await a.inject({ method: 'PUT', url: '/ai/tasks/taxation/route', payload: { modelId: 'flash' } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'DELETE', url: '/ai/models/flash' })).statusCode).toBe(409);
    expect((await a.inject({ method: 'DELETE', url: '/ai/providers/g' })).statusCode).toBe(409);
    await a.close();
  });

  it('pricing-hints returns a known model prefill', async () => {
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/ai/pricing-hints?modelString=gemini-2.5-flash' });
    expect(r.json().data).toEqual({ inputPerM: 0.3, outputPerM: 2.5 });
    await a.close();
  });

  it('PATCH /ai/models/:id validates prices (I1)', async () => {
    const a = await app();
    await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'g', dialect: 'gemini', label: 'G', apiKey: 'k' } });
    await a.inject({ method: 'POST', url: '/ai/models', payload: { id: 'flash', providerId: 'g', modelString: 'x', label: 'F', inputPerM: 1.0, outputPerM: 2.0 } });
    // Negative price should fail
    const neg = await a.inject({ method: 'PATCH', url: '/ai/models/flash', payload: { inputPerM: -5 } });
    expect(neg.statusCode).toBe(400);
    expect(neg.json().error.message).toContain('inputPerM must be a number >= 0');
    // Valid price should succeed
    const ok = await a.inject({ method: 'PATCH', url: '/ai/models/flash', payload: { inputPerM: 0.5 } });
    expect(ok.statusCode).toBe(200);
    const model = await a.inject({ method: 'GET', url: '/ai/models?providerId=g' });
    expect(model.json().data[0].inputPerM).toBe(0.5);
    await a.close();
  });

  it('POST /ai/providers and /ai/models reject duplicate id with 409 (I2)', async () => {
    const a = await app();
    await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'gemini', dialect: 'gemini', label: 'G1', apiKey: 'k' } });
    const dup = await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'gemini', dialect: 'gemini', label: 'G2', apiKey: 'k2' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.message).toContain('Provider "gemini" already exists');

    await a.inject({ method: 'POST', url: '/ai/models', payload: { id: 'flash', providerId: 'gemini', modelString: 'x', label: 'F1', inputPerM: 1, outputPerM: 2 } });
    const dupModel = await a.inject({ method: 'POST', url: '/ai/models', payload: { id: 'flash', providerId: 'gemini', modelString: 'y', label: 'F2', inputPerM: 3, outputPerM: 4 } });
    expect(dupModel.statusCode).toBe(409);
    expect(dupModel.json().error.message).toContain('Model "flash" already exists');
    await a.close();
  });
});
