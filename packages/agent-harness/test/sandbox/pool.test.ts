import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeSandboxPool } from '../../src/sandbox/pool';
import { createSandboxRuntime } from '../../src/sandbox';
import { UNAVAILABLE_MESSAGE } from '../../src/sandbox/launch';
import type { SandboxHandle, RunRequest } from '../../src/sandbox/sandboxProcess';

function fakeHandle(log: string[], opts: { delayMs?: number } = {}): SandboxHandle {
  let alive = true;
  let busy = false;
  return {
    get alive() { return alive; },
    kill() { alive = false; log.push('kill'); },
    async run(req: RunRequest) {
      if (busy) throw new Error('concurrent run on one child');
      busy = true;
      log.push(`start:${req.code}`);
      await new Promise((r) => setTimeout(r, opts.delayMs ?? 5));
      log.push(`end:${req.code}`);
      busy = false;
      if (req.code === 'die') alive = false;
      return { stdout: '', result: req.code, durationMs: 1 };
    },
  };
}
const req = (code: string): RunRequest => ({ code, datasets: {}, timeoutMs: 1000 });

describe('makeSandboxPool', () => {
  afterEach(() => vi.useRealTimers());

  it('starts one child per thread lazily and reuses it', async () => {
    const log: string[] = [];
    const start = vi.fn(async () => fakeHandle(log));
    const pool = makeSandboxPool({ start });
    expect(start).not.toHaveBeenCalled();
    await pool.run('t1', req('a'));
    await pool.run('t1', req('b'));
    await pool.run('t2', req('c'));
    expect(start).toHaveBeenCalledTimes(2);
    expect(pool.size()).toBe(2);
    pool.closeAll();
  });

  it('serialises concurrent runs in one thread', async () => {
    const log: string[] = [];
    const pool = makeSandboxPool({ start: async () => fakeHandle(log, { delayMs: 20 }) });
    const [a, b] = await Promise.all([pool.run('t', req('a')), pool.run('t', req('b'))]);
    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(log).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
    pool.closeAll();
  });

  it('restarts after the child died', async () => {
    const log: string[] = [];
    const start = vi.fn(async () => fakeHandle(log));
    const pool = makeSandboxPool({ start });
    await pool.run('t', req('die'));
    await pool.run('t', req('again'));
    expect(start).toHaveBeenCalledTimes(2);
    pool.closeAll();
  });

  it('kills a thread child after the idle period', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const start = vi.fn(async () => fakeHandle(log, { delayMs: 0 }));
    const pool = makeSandboxPool({ start, idleMs: 1000 });
    const p = pool.run('t', req('a'));
    await vi.advanceTimersByTimeAsync(1);
    await p;
    await vi.advanceTimersByTimeAsync(1001);
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toContain('kill');
    expect(pool.size()).toBe(0);
    const p2 = pool.run('t', req('b'));
    await vi.advanceTimersByTimeAsync(1);
    await p2;
    expect(start).toHaveBeenCalledTimes(2);
    pool.closeAll();
  });

  it('closeAll with a run in flight and one queued starts one child and errors the queued run', async () => {
    const log: string[] = [];
    const start = vi.fn(async () => fakeHandle(log, { delayMs: 20 }));
    const pool = makeSandboxPool({ start });
    const a = pool.run('t', req('a'));
    const b = pool.run('t', req('b'));
    await new Promise((r) => setTimeout(r, 5));
    pool.closeAll();
    const [, rb] = await Promise.all([a, b]);
    expect(rb.error).toMatch(/closed/);
    expect(start).toHaveBeenCalledTimes(1);
    expect(log).not.toContain('start:b');
    expect((await pool.run('t', req('c'))).error).toMatch(/closed/);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not over-report size after a start failure', async () => {
    const pool = makeSandboxPool({ start: async () => { throw new Error('x'); } });
    await pool.run('t', req('a'));
    expect(pool.size()).toBe(0);
  });

  it('returns a start failure as an error result, not a throw', async () => {
    const pool = makeSandboxPool({ start: async () => { throw new Error('no wheels'); } });
    const r = await pool.run('t', req('a'));
    expect(r.error).toMatch(/could not start.*no wheels/);
  });
});

describe('createSandboxRuntime', () => {
  it('fails closed off darwin without spawning', async () => {
    const rt = createSandboxRuntime({ platform: 'linux' });
    const r = await rt.run('t', { code: '1', datasets: {} });
    expect(r).toEqual({ stdout: '', result: null, error: UNAVAILABLE_MESSAGE, durationMs: 0 });
    rt.close();
  });
});
