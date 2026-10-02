import { describe, it, expect } from 'vitest';
import { makeWealthHarness, type HarnessDeps } from '../src/runChat';
import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import type { SandboxRuntime } from '../src/sandbox';

function repos() {
  return {
    routeRepo: { getByTask: (t: string) => ({ task: t, modelId: 'm1', updatedAt: 't' }) } as any,
    modelRepo: { get: () => ({ id: 'm1', providerId: 'p1', modelString: 'gemini-2.5-flash', label: 'F', inputPerM: 1, outputPerM: 2, createdAt: 't' }) } as any,
    providerRepo: { get: () => ({ id: 'p1', dialect: 'gemini', label: 'G', secretEnc: 'ENC', configJson: null, createdAt: 't' }) } as any,
    decrypt: () => 'k',
  };
}
function pythonThenAnswer() {
  let call = 0;
  const finish = (reason: string) => ({ type: 'finish', finishReason: reason, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
  return new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: 'text', text: 'ok' }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] } as any),
    doStream: async () => {
      call += 1;
      const chunks: any[] = call === 1
        ? [{ type: 'tool-call', toolCallId: 'py1', toolName: 'run_python', input: JSON.stringify({ code: '1 + 1', datasets: ['nav:120716'] }) }, finish('tool-calls')]
        : [{ type: 'text-delta', id: '1', delta: 'It is 2.' }, finish('stop')];
      return { stream: simulateReadableStream({ chunks }) };
    },
  } as any);
}

describe('runChat run_python wiring', () => {
  function deps(sandboxCalls: unknown[], datasetCalls: string[]): HarnessDeps {
    const sandbox: SandboxRuntime = {
      run: async (threadId, req) => { sandboxCalls.push({ threadId, ...req }); return { stdout: '', result: 2, durationMs: 3 }; },
      close: () => {},
    };
    return {
      ...repos(), usageRepo: { insert: () => 1 }, now: () => '2026-09-30T00:00:00.000Z',
      dbPath: ':memory:', memoryUrl: ':memory:', makeModel: () => pythonThenAnswer(),
      sandbox, resolveDataset: async (n: string) => { datasetCalls.push(n); return { points: [] }; },
    } as HarnessDeps;
  }

  it('the investment agent runs Python on its thread and emits a computation event', async () => {
    const sandboxCalls: any[] = [];
    const datasetCalls: string[] = [];
    const h = makeWealthHarness(deps(sandboxCalls, datasetCalls));
    const r = await h.runChat({ message: 'what is 1+1', agent: 'investment', threadId: 'thread-py' });
    const events: any[] = [];
    for await (const ev of r.events) events.push(ev);
    await r.done;
    expect(datasetCalls).toEqual(['nav:120716']);
    expect(sandboxCalls[0].threadId).toBe('thread-py');
    expect(sandboxCalls[0].code).toBe('1 + 1');
    expect(events).toContainEqual({ type: 'computation', code: '1 + 1', stdout: '', result: 2, durationMs: 3 });
    expect(events).toContainEqual({ type: 'step', label: 'Running a calculation' });
  }, 30000);

  it.each(['wealth', 'expense'] as const)('the %s agent can also run Python', async (agent) => {
    const sandboxCalls: any[] = [];
    const datasetCalls: string[] = [];
    const h = makeWealthHarness(deps(sandboxCalls, datasetCalls));
    const r = await h.runChat({ message: 'what is 1+1', agent, threadId: `thread-${agent}` });
    const events: any[] = [];
    for await (const ev of r.events) events.push(ev);
    await r.done;
    expect(sandboxCalls).toHaveLength(1);
    expect(sandboxCalls[0].threadId).toBe(`thread-${agent}`);
    expect(events).toContainEqual({ type: 'step', label: 'Running a calculation' });
  }, 30000);

  it('no agent has run_python when no dataset resolver is wired', async () => {
    const sandboxCalls: any[] = [];
    for (const agent of ['wealth', 'expense', 'investment'] as const) {
      const d = { ...deps(sandboxCalls, []), resolveDataset: undefined } as HarnessDeps;
      const h = makeWealthHarness(d);
      const r = await h.runChat({ message: 'hi', agent });
      try { for await (const _ of r.events) { /* drain */ } } catch { /* expected: unknown tool */ }
      await r.done.catch(() => {});
    }
    expect(sandboxCalls).toHaveLength(0);
  }, 90000);

  it('close() closes the sandbox runtime', () => {
    let closed = false;
    const h = makeWealthHarness({ ...deps([], []), sandbox: { run: async () => ({ stdout: '', result: null, durationMs: 0 }), close: () => { closed = true; } } } as HarnessDeps);
    h.close();
    expect(closed).toBe(true);
  });
});
