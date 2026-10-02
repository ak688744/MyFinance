import { describe, it, expect, afterEach } from 'vitest';
import { SANDBOX_RUNNABLE, testSpec } from './runnable';
import { resolveSandboxPaths } from '../../src/sandbox/paths';
import { startSandbox, OUTPUT_LIMIT, MEMORY_MESSAGE, killAllSandboxChildren, liveSandboxChildCount, type SandboxHandle, type BridgeHandler } from '../../src/sandbox/sandboxProcess';
const echoBridge: BridgeHandler = async (fn, argsJson) => {
  if (fn !== 'echo') throw new Error(`unknown ${fn}`);
  const args = JSON.parse(argsJson) as unknown[];
  if (args[0] === 'boom') throw new Error('host says no');
  return JSON.stringify({ got: args });
};

describe.skipIf(!SANDBOX_RUNNABLE)('startSandbox (real Pyodide)', () => {
  let sb: SandboxHandle | undefined;
  afterEach(() => { sb?.kill(); sb = undefined; });
  const start = (bridge = echoBridge) =>
    startSandbox({ spec: testSpec(), childEntry: resolveSandboxPaths().childEntry, bridge });
  const run = (code: string, datasets: Record<string, string> = {}) => sb!.run({ code, datasets, timeoutMs: 30_000 });

  it('runs numpy/pandas and returns the last expression as JSON', async () => {
    sb = await start();
    const r = await run('import numpy as np, pandas as pd\nfloat(np.mean(pd.Series([1, 2, 3])))');
    expect(r.error).toBeUndefined();
    expect(r.result).toBe(2);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('captures stdout and converts numpy/pandas results', async () => {
    sb = await start();
    const r = await run('import numpy as np\nprint("hello")\n{"a": np.float64(1.5), "b": np.arange(3)}');
    expect(r.stdout).toContain('hello');
    expect(r.result).toEqual({ a: 1.5, b: [0, 1, 2] });
  }, 120_000);

  it('returns a repr string for non-JSON results, and null for None', async () => {
    sb = await start();
    expect((await run('import pandas as pd\npd.Timestamp("2024-01-01")')).result).toMatch(/2024-01-01/);
    expect((await run('x = 1')).result).toBeNull();
  }, 120_000);

  it('returns Python exceptions as error, keeps the session alive and keeps state', async () => {
    sb = await start();
    const bad = await run('y = 41\nraise ValueError("nope")');
    expect(bad.error).toMatch(/ValueError: nope/);
    expect(sb.alive).toBe(true);
    expect((await run('y + 1')).result).toBe(42);
  }, 120_000);

  it('writes datasets to /data and nowhere else', async () => {
    sb = await start();
    const r = await run('import json\njson.load(open("/data/nav_1.json"))["points"][0]["nav"]', {
      'nav_1.json': JSON.stringify({ points: [{ date: '2024-01-01', nav: 10 }] }),
    });
    expect(r.result).toBe(10);
  }, 120_000);

  it('routes myfinance calls to the host bridge and surfaces host errors', async () => {
    sb = await start();
    const ok = await run('import myfinance\nawait myfinance.echo([1, 2], "x")');
    expect(ok.result).toEqual({ got: [[1, 2], 'x'] });
    const bad = await run('import myfinance\nawait myfinance.echo("boom")');
    expect(bad.error).toMatch(/host says no/);
  }, 120_000);

  it('truncates runaway stdout at OUTPUT_LIMIT', async () => {
    sb = await start();
    const r = await run('for i in range(200000): print("x" * 50)');
    expect(r.stdout.length).toBeLessThanOrEqual(OUTPUT_LIMIT + 20);
    expect(r.stdout.endsWith('…[truncated]')).toBe(true);
  }, 120_000);

  it('fails the pending call immediately when the child dies mid-run', async () => {
    sb = await start();
    const pending = run('while True: pass');
    setTimeout(() => sb!.kill(), 300);
    const t0 = Date.now();
    const r = await pending;
    expect(r.error).toMatch(/exited unexpectedly|session was reset/);
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(sb.alive).toBe(false);
  }, 120_000);
});

describe.skipIf(!SANDBOX_RUNNABLE)('startSandbox memory cap', () => {
  it('kills a synchronous over-allocation with MEMORY_MESSAGE, host-side', async () => {
    const sb = await startSandbox({ spec: testSpec(), childEntry: resolveSandboxPaths().childEntry, bridge: echoBridge, memCapMb: 64, pollMs: 50 });
    try {
      const r = await sb.run({ code: 'import numpy as np\na = np.ones(400*1024*1024//8)\nlist(a)[:0]\nwhile True:\n    b = np.ones(10_000_000)\n    b.sum()', datasets: {}, timeoutMs: 60_000 });
      expect(r.error).toBe(MEMORY_MESSAGE);
      expect(sb.alive).toBe(false);
    } finally { sb.kill(); }
  }, 120_000);

  it('still allows ~100MB of work under a 512MB cap', async () => {
    const sb = await startSandbox({ spec: testSpec(), childEntry: resolveSandboxPaths().childEntry, bridge: echoBridge });
    try {
      const r = await sb.run({ code: 'import numpy as np\nfloat(np.ones(100*1024*1024//8).sum())', datasets: {}, timeoutMs: 60_000 });
      expect(r.error).toBeUndefined();
      expect(r.result).toBe(13107200);
    } finally { sb.kill(); }
  }, 120_000);
});

describe.skipIf(!SANDBOX_RUNNABLE)('startSandbox lifecycle guards', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const mk = (extra: Record<string, unknown> = {}, bridge: BridgeHandler = echoBridge) =>
    startSandbox({ spec: testSpec(), childEntry: resolveSandboxPaths().childEntry, bridge, ...extra });

  it('kills a busy child through the host-exit hook function', async () => {
    const sb = await mk();
    const busy = sb.run({ code: 'while True: pass', datasets: {}, timeoutMs: 60_000 });
    await sleep(300);
    expect(liveSandboxChildCount()).toBeGreaterThan(0);
    killAllSandboxChildren();
    const r = await busy;
    expect(r.error).toMatch(/exited unexpectedly|session was reset/);
    expect(sb.alive).toBe(false);
    expect(liveSandboxChildCount()).toBe(0);
  }, 120_000);

  it('rejects bridge calls that arrive with no run pending', async () => {
    let calls = 0;
    const sb = await mk({}, async () => { calls++; return '1'; });
    try {
      await sb.run({ code: 'import asyncio, myfinance\nasync def f():\n    await asyncio.sleep(0.3)\n    try:\n        await myfinance.echo(1)\n    except Exception:\n        pass\nasyncio.ensure_future(f())\n1', datasets: {}, timeoutMs: 30_000 });
      await sleep(1500);
      expect(calls).toBe(0);
      expect(sb.alive).toBe(true);
    } finally { sb.kill(); }
  }, 120_000);

  it('rejects oversize bridge arguments with an error to Python', async () => {
    let calls = 0;
    const sb = await mk({}, async () => { calls++; return '1'; });
    try {
      const r = await sb.run({ code: 'import myfinance\nawait myfinance.echo("x" * 6_000_000)', datasets: {}, timeoutMs: 60_000 });
      expect(r.error).toMatch(/too large/);
      expect(calls).toBe(0);
    } finally { sb.kill(); }
  }, 120_000);

  it('catches a delayed background allocation after run() returned', async () => {
    const sb = await mk({ memCapMb: 64, pollMs: 50 });
    try {
      const r = await sb.run({ code: 'import asyncio, numpy as np\nkeep = []\nasync def g():\n    await asyncio.sleep(0.5)\n    keep.append(np.ones(400*1024*1024//8))\nasyncio.ensure_future(g())\n1', datasets: {}, timeoutMs: 30_000 });
      expect(r.result).toBe(1);
      for (let i = 0; i < 60 && sb.alive; i++) await sleep(100);
      expect(sb.alive).toBe(false);
      expect((await sb.run({ code: '1', datasets: {}, timeoutMs: 5_000 })).error).toBe(MEMORY_MESSAGE);
    } finally { sb.kill(); }
  }, 120_000);

  it('clears previous datasets at the start of each run', async () => {
    const sb = await mk();
    try {
      await sb.run({ code: '1', datasets: { 'a_1.json': '{}' }, timeoutMs: 30_000 });
      const r = await sb.run({ code: 'import os\nsorted(os.listdir("/data"))', datasets: { 'b_1.json': '{}' }, timeoutMs: 30_000 });
      expect(r.result).toEqual(['b_1.json']);
    } finally { sb.kill(); }
  }, 120_000);
});
