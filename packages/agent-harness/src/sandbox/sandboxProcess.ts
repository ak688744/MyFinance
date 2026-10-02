import { fork, execFile, type ChildProcess } from 'node:child_process';
import type { LaunchSpec } from './launch';

export const OUTPUT_LIMIT = 20_480;
export const TIMEOUT_MESSAGE = (ms: number) => `Timed out after ${Math.round(ms / 1000)} s; the Python session was reset.`;
export const MEMORY_MESSAGE = 'Memory limit exceeded (512 MB above baseline); the Python session was reset.';
export const CRASH_MESSAGE = (code: number | null) => `The Python sandbox exited unexpectedly (code ${code}); the session was reset.`;

export type RunRequest = { code: string; datasets: Record<string, string>; timeoutMs: number };
export type RunOutcome = { stdout: string; result: unknown; error?: string; durationMs: number };
export type BridgeHandler = (fn: string, argsJson: string) => Promise<string>;
export interface SandboxHandle {
  run(req: RunRequest): Promise<RunOutcome>;
  kill(): void;
  readonly alive: boolean;
}

export const MAX_BRIDGE_ARGS = 5 * 1024 * 1024;

// One process-exit hook for every live child: a child stuck in WASM cannot notice that
// its host died (the IPC disconnect handler never runs), so the host kills it on exit.
const liveChildren = new Set<ChildProcess>();
let exitHookInstalled = false;
export function killAllSandboxChildren(): void {
  for (const c of liveChildren) { try { c.kill('SIGKILL'); } catch { /* already gone */ } }
  liveChildren.clear();
}
function trackChild(c: ChildProcess): void {
  liveChildren.add(c);
  c.once('exit', () => liveChildren.delete(c));
  if (!exitHookInstalled) { exitHookInstalled = true; process.on('exit', killAllSandboxChildren); }
}
export function liveSandboxChildCount(): number { return liveChildren.size; }

export function truncate(s: string, limit = OUTPUT_LIMIT): string {
  return s.length > limit ? `${s.slice(0, limit)}…[truncated]` : s;
}

type ChildMsg =
  | { type: 'ready' }
  | { type: 'result'; id: number; stdout: string; resultJson: string; error?: string; durationMs: number }
  | { type: 'bridge'; seq: number; fn: string; argsJson: string };

export async function startSandbox(o: {
  spec: LaunchSpec;
  childEntry: string;
  bridge: BridgeHandler;
  readyTimeoutMs?: number;
  /** Growth in RSS above the post-load baseline that kills the child. Defaults to the spec's MF_MEM_CAP_MB. */
  memCapMb?: number;
  pollMs?: number;
}): Promise<SandboxHandle> {
  const child: ChildProcess = fork(o.childEntry, [], {
    execPath: o.spec.execPath,
    execArgv: o.spec.execArgv,
    env: o.spec.env as NodeJS.ProcessEnv,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  trackChild(child);
  let alive = true;
  let memoryKilled = false;
  let stderrTail = '';
  const memCapKb = (o.memCapMb ?? (Number(o.spec.env.MF_MEM_CAP_MB) || 512)) * 1024;
  // Async ps with an in-flight guard; a ps failure fails open (no kill), which only
  // loses the memory cap for that tick.
  const rssKb = (): Promise<number | null> => new Promise((res) => {
    execFile('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' }, (err, out) => {
      const n = err ? NaN : Number(String(out).trim());
      res(Number.isFinite(n) && n > 0 ? n : null);
    });
  });
  let baselineKb: number | null = null;
  let memTimer: NodeJS.Timeout | null = null;
  let psInFlight = false;
  const stopMemWatch = () => { if (memTimer) { clearInterval(memTimer); memTimer = null; } };
  // Runs for as long as the child lives, not only during run(): Python can keep working
  // (asyncio callbacks, delayed allocations) after a run returns.
  const startMemWatch = () => {
    stopMemWatch();
    if (baselineKb === null) return;
    memTimer = setInterval(() => {
      if (psInFlight || !alive) return;
      psInFlight = true;
      void rssKb().then((r) => {
        psInFlight = false;
        if (alive && r !== null && r - (baselineKb as number) > memCapKb) {
          memoryKilled = true;
          alive = false;
          stopMemWatch();
          child.kill('SIGKILL');
          finishPending({ stdout: '', result: null, error: MEMORY_MESSAGE });
        }
      });
    }, o.pollMs ?? 200);
    memTimer.unref();
  };
  child.stderr?.on('data', (d) => { stderrTail = (stderrTail + String(d)).slice(-2000); });

  let nextId = 0;
  let pending: { id: number; resolve: (r: RunOutcome) => void; timer: NodeJS.Timeout; started: number } | null = null;

  const finishPending = (outcome: Omit<RunOutcome, 'durationMs'>) => {
    if (!pending) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timer);
    p.resolve({ ...outcome, durationMs: Date.now() - p.started });
  };

  await new Promise<void>((resolveReady, rejectReady) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); rejectReady(new Error(`Sandbox did not start in time. ${stderrTail}`)); }, o.readyTimeoutMs ?? 60_000);
    child.once('exit', (code) => { clearTimeout(timer); alive = false; rejectReady(new Error(`Sandbox failed to start (exit ${code}). ${stderrTail}`)); });
    child.once('error', (e) => { clearTimeout(timer); alive = false; rejectReady(new Error(`Sandbox failed to spawn: ${e.message}`)); });
    child.on('message', (m: ChildMsg) => { if (m.type === 'ready') { clearTimeout(timer); void rssKb().then((b) => { baselineKb = b; startMemWatch(); resolveReady(); }); } });
  });

  child.on('exit', (code, signal) => {
    alive = false;
    stopMemWatch();
    if (memoryKilled) return;
    const error = code === 137 ? MEMORY_MESSAGE : CRASH_MESSAGE(code ?? (signal ? -1 : null));
    finishPending({ stdout: '', result: null, error });
  });

  child.on('error', () => {
    alive = false;
    finishPending({ stdout: '', result: null, error: CRASH_MESSAGE(null) });
  });

  const safeSend = (msg: unknown) => {
    try { child.send(msg as never); return true; } catch { return false; }
  };

  child.on('message', (m: ChildMsg) => {
    if (m.type === 'result' && pending && m.id === pending.id) {
      let result: unknown = null;
      try { result = JSON.parse(m.resultJson); } catch { result = null; }
      const resultText = JSON.stringify(result) ?? 'null';
      if (resultText.length > OUTPUT_LIMIT) result = truncate(resultText);
      finishPending({ stdout: truncate(m.stdout), result, ...(m.error ? { error: truncate(m.error, 4000) } : {}) });
    } else if (m.type === 'bridge') {
      const refuse = (error: string) => { if (child.connected) safeSend({ type: 'bridge-reply', seq: m.seq, ok: false, error }); };
      if (!pending) return refuse('myfinance calls are only allowed while a run is in progress');
      if (typeof m.argsJson !== 'string' || m.argsJson.length > MAX_BRIDGE_ARGS) return refuse('myfinance call arguments are too large');
      o.bridge(m.fn, m.argsJson).then(
        (valueJson) => { if (child.connected) safeSend({ type: 'bridge-reply', seq: m.seq, ok: true, valueJson }); },
        (e: unknown) => { if (child.connected) safeSend({ type: 'bridge-reply', seq: m.seq, ok: false, error: e instanceof Error ? e.message : String(e) }); },
      );
    }
  });

  return {
    get alive() { return alive; },
    kill() { if (alive) child.kill('SIGKILL'); },
    run(req: RunRequest): Promise<RunOutcome> {
      if (!alive) return Promise.resolve({ stdout: '', result: null, error: memoryKilled ? MEMORY_MESSAGE : CRASH_MESSAGE(null), durationMs: 0 });
      if (pending) return Promise.resolve({ stdout: '', result: null, error: 'A Python run is already in progress.', durationMs: 0 });
      return new Promise<RunOutcome>((resolve) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          const p = pending;
          if (p?.id !== id) return;
          pending = null;
          alive = false;
          stopMemWatch();
          child.kill('SIGKILL');
          resolve({ stdout: '', result: null, error: TIMEOUT_MESSAGE(req.timeoutMs), durationMs: Date.now() - p.started });
        }, req.timeoutMs);
        pending = { id, resolve, timer, started: Date.now() };
        if (!safeSend({ type: 'run', id, code: req.code, datasets: req.datasets })) {
          alive = false;
          finishPending({ stdout: '', result: null, error: CRASH_MESSAGE(null) });
        }
      });
    },
  };
}
