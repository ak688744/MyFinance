// packages/api/test/universeJob.test.ts
import { describe, it, expect } from 'vitest';
import { makeUniverseJob } from '../src/lib/universeJob';

describe('makeUniverseJob', () => {
  it('marks state as failed and sets lastError when run throws synchronously', async () => {
    const error = new Error('sync throw in run');
    const run = () => { throw error; };
    const getMeta = () => ({ builtAt: '2026-09-30T00:00:00Z', asOf: null });

    const job = makeUniverseJob(run, getMeta);

    const result = job.start();
    expect(result.started).toBe(true);

    // state is immediately 'failed' because sync throw is caught synchronously
    const status = job.status();
    expect(status.state).toBe('failed');
    expect(status.lastError).toBe('sync throw in run');

    // settle should complete without errors (current is already null from the sync catch)
    await job.settle();
  });

  it('allows subsequent start() after a sync throw failure', async () => {
    const error = new Error('sync throw');
    const run = () => { throw error; };
    const getMeta = () => ({ builtAt: '2026-09-30T00:00:00Z', asOf: null });

    const job = makeUniverseJob(run, getMeta);

    // first attempt
    const result1 = job.start();
    expect(result1.started).toBe(true);
    await job.settle();
    expect(job.status().state).toBe('failed');

    // second attempt should be allowed (not stuck at 'running')
    const result2 = job.start();
    expect(result2.started).toBe(true);
  });

  it('still handles async Promise rejections correctly', async () => {
    const error = new Error('async rejection');
    const run = () => Promise.reject(error);
    const getMeta = () => ({ builtAt: '2026-09-30T00:00:00Z', asOf: null });

    const job = makeUniverseJob(run, getMeta);

    job.start();
    await job.settle();

    const status = job.status();
    expect(status.state).toBe('failed');
    expect(status.lastError).toBe('async rejection');
  });

  it('succeeds when run resolves normally', async () => {
    const run = () => Promise.resolve();
    const getMeta = () => ({ builtAt: '2026-09-30T00:00:00Z', asOf: null });

    const job = makeUniverseJob(run, getMeta);

    job.start();
    await job.settle();

    const status = job.status();
    expect(status.state).toBe('idle');
    expect(status.lastError).toBeNull();
  });

  it('prevents concurrent runs with single-flight guard', () => {
    const run = () => new Promise(() => {}); // never resolves
    const getMeta = () => ({ builtAt: '2026-09-30T00:00:00Z', asOf: null });

    const job = makeUniverseJob(run, getMeta);

    const result1 = job.start();
    expect(result1.started).toBe(true);
    expect(job.status().state).toBe('running');

    const result2 = job.start();
    expect(result2.started).toBe(false);
  });
});
