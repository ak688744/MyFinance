import { describe, it, expect, vi } from 'vitest';
import { buildRunPythonTool, runPython, datasetFileName, RUN_PYTHON_TOOL_NAME, MAX_DATASETS, MAX_DATASET_BYTES, MAX_TOTAL_DATASET_BYTES } from '../src/runPythonTool';
import type { SandboxRuntime } from '../src/sandbox';

function fakeSandbox(result: unknown = 1) {
  const calls: { threadId: string; code: string; datasets: Record<string, string> }[] = [];
  const sandbox: SandboxRuntime = {
    run: async (threadId, req) => { calls.push({ threadId, ...req }); return { stdout: 'x'.repeat(30_000), result, durationMs: 7 }; },
    close: () => {},
  };
  return { sandbox, calls };
}

describe('datasetFileName', () => {
  it.each([
    ['nav:120716', 'nav_120716.json'], ['transactions:12', 'transactions_12.json'],
    ['universe_stats', 'universe_stats.json'], ['category_stats', 'category_stats.json'], ['fact_sheet', 'fact_sheet.json'],
  ])('%s -> %s', (n, f) => expect(datasetFileName(n)).toBe(f));
  it.each(['nav:../../etc', 'nav:', 'transactions:abc', 'fact-sheet', 'NAV:1', 'nav:1/2', '', 'nav:123\n', 'nav:12\n3', 'nav:\u0661\u0662\u0663', 'nav:12', 'nav:123456789', 'transactions:1234567890'])('rejects %s', (n) => expect(datasetFileName(n)).toBeNull());
});

describe('runPython', () => {
  it('stages resolved datasets as JSON files and runs on the thread sandbox', async () => {
    const { sandbox, calls } = fakeSandbox();
    const resolveDataset = vi.fn(async (n: string) => ({ name: n }));
    const out = await runPython({ threadId: 't9', sandbox, resolveDataset }, { code: 'print(1)', datasets: ['nav:120716'] });
    expect(calls).toHaveLength(1);
    expect(calls[0].threadId).toBe('t9');
    expect(JSON.parse(calls[0].datasets['nav_120716.json'])).toEqual({ name: 'nav:120716' });
    expect(out.stdout.length).toBeLessThanOrEqual(20_480 + 20);
    expect(out.durationMs).toBe(7);
  });
  it('rejects invalid names and too many datasets without running code', async () => {
    const { sandbox, calls } = fakeSandbox();
    const bad = await runPython({ threadId: 't', sandbox, resolveDataset: async () => ({}) }, { code: '1', datasets: ['nav:../../x'] });
    expect(bad.error).toMatch(/Unknown dataset name "nav:..\/..\/x"/);
    const many = Array.from({ length: MAX_DATASETS + 1 }, (_, i) => `nav:${100 + i}`);
    const tooMany = await runPython({ threadId: 't', sandbox, resolveDataset: async () => ({}) }, { code: '1', datasets: many });
    expect(tooMany.error).toMatch(/At most 8 datasets/);
    expect(calls).toHaveLength(0);
  });
  it('returns a resolver failure as an error without running code', async () => {
    const { sandbox, calls } = fakeSandbox();
    const out = await runPython({ threadId: 't', sandbox, resolveDataset: async () => { throw new Error('no NAV history for 999999'); } }, { code: '1', datasets: ['nav:999999'] });
    expect(out.error).toBe('Dataset nav:999999: no NAV history for 999999');
    expect(calls).toHaveLength(0);
  });
  it('never throws when the sandbox itself throws', async () => {
    const sandbox: SandboxRuntime = { run: async () => { throw new Error('ipc gone'); }, close: () => {} };
    const out = await runPython({ threadId: 't', sandbox, resolveDataset: async () => ({}) }, { code: '1', datasets: [] });
    expect(out.error).toMatch(/ipc gone/);
  });
});

describe('runPython hardening', () => {
  const D = (sandbox: SandboxRuntime, resolveDataset: (n: string) => Promise<unknown>) => ({ threadId: 't', sandbox, resolveDataset });
  it('dedupes duplicate names', async () => {
    const { sandbox, calls } = fakeSandbox();
    const r = vi.fn(async () => ({}));
    await runPython(D(sandbox, r), { code: '1', datasets: ['nav:123', 'nav:123'] });
    expect(r).toHaveBeenCalledTimes(1);
    expect(Object.keys(calls[0].datasets)).toEqual(['nav_123.json']);
  });
  it('rejects a resolver returning undefined', async () => {
    const { sandbox, calls } = fakeSandbox();
    const out = await runPython(D(sandbox, async () => undefined), { code: '1', datasets: ['nav:123'] });
    expect(out.error).toBe('Dataset nav:123: resolver returned no data');
    expect(calls).toHaveLength(0);
  });
  it('survives resolvers throwing null or a string', async () => {
    const { sandbox } = fakeSandbox();
    const a = await runPython(D(sandbox, async () => { throw null; }), { code: '1', datasets: ['nav:123'] });
    expect(a.error).toBe('Dataset nav:123: null');
    const b = await runPython(D(sandbox, async () => { throw 'boom'; }), { code: '1', datasets: ['nav:123'] });
    expect(b.error).toBe('Dataset nav:123: boom');
  });
  it('enforces per-dataset and total byte caps', async () => {
    const { sandbox, calls } = fakeSandbox();
    const big = await runPython(D(sandbox, async () => 'x'.repeat(MAX_DATASET_BYTES)), { code: '1', datasets: ['nav:123'] });
    expect(big.error).toMatch(/too large/);
    const chunk = 'x'.repeat(MAX_DATASET_BYTES - 100);
    const names = Array.from({ length: 5 }, (_, i) => `nav:${100 + i}`);
    expect(MAX_TOTAL_DATASET_BYTES).toBeLessThan(5 * chunk.length);
    const tot = await runPython(D(sandbox, async () => chunk), { code: '1', datasets: names });
    expect(tot.error).toMatch(/total limit/);
    expect(calls).toHaveLength(0);
  });
  it('caps huge result and huge error', async () => {
    const sandbox: SandboxRuntime = { run: async () => ({ stdout: '', result: 'y'.repeat(50_000), error: 'e'.repeat(50_000), durationMs: 1 }), close: () => {} };
    const out = await runPython(D(sandbox, async () => ({})), { code: '1', datasets: [] });
    expect(out.result).toMatch(/^\[result truncated: \d+ chars\]$/);
    expect(out.error!.length).toBeLessThanOrEqual(20_480 + 20);
    const small = await runPython(D({ run: async () => ({ stdout: '', result: { a: 1 }, durationMs: 1 }), close: () => {} }, async () => ({})), { code: '1' });
    expect(small.result).toEqual({ a: 1 });
  });
});

describe('buildRunPythonTool', () => {
  it('registers under run_python with the bridge documented in its description', () => {
    const { sandbox } = fakeSandbox();
    const tools = buildRunPythonTool({ threadId: 't', sandbox, resolveDataset: async () => ({}) });
    const tool = tools[RUN_PYTHON_TOOL_NAME] as { description: string };
    expect(tool).toBeDefined();
    expect(tool.description).toContain('myfinance.trailing_return(');
    expect(tool.description).toContain('/data/nav_<code>.json');
  });
});
