import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from './helpers';
import { makeUniverseJob } from '../src/lib/universeJob';

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

describe('universe job', () => {
  it('runs once at a time and records failures', async () => {
    let release!: () => void;
    const job = makeUniverseJob(() => new Promise<void>((r) => { release = r; }), () => null);
    expect(job.start()).toEqual({ started: true });
    expect(job.start()).toEqual({ started: false });
    expect(job.status().state).toBe('running');
    release();
    await job.settle();
    expect(job.status().state).toBe('idle');
    const failing = makeUniverseJob(async () => { throw new Error('AMFI down'); }, () => null);
    failing.start();
    await failing.settle();
    expect(failing.status()).toMatchObject({ state: 'failed', lastError: 'AMFI down' });
  });
});

describe('review and universe routes', () => {
  it('GET /investments/review reports universe_not_built on a fresh DB', async () => {
    app = await buildTestServer();
    const r = await app.inject({ method: 'GET', url: '/investments/review' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toMatchObject({ reviewUnavailable: true, reason: 'universe_not_built' });
  });

  it('POST /investments/universe/refresh starts the injected rebuild and status reflects it', async () => {
    let calls = 0;
    app = await buildTestServer({
      universeRefresh: async (onProgress) => { calls += 1; onProgress(1, 1); },
    });
    const before = await app.inject({ method: 'GET', url: '/investments/universe/status' });
    expect(before.json().data).toMatchObject({ state: 'idle', builtAt: null });
    const r = await app.inject({ method: 'POST', url: '/investments/universe/refresh', payload: {} });
    expect(r.json().data).toEqual({ started: true });
    await new Promise((res) => setImmediate(res));
    const after = await app.inject({ method: 'GET', url: '/investments/universe/status' });
    expect(after.json().data.state).toBe('idle');
    expect(calls).toBe(1);
  });
});
