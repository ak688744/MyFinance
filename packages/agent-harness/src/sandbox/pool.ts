import type { RunOutcome, RunRequest, SandboxHandle } from './sandboxProcess';

export interface SandboxPool {
  run(threadId: string, req: RunRequest): Promise<RunOutcome>;
  closeAll(): void;
  size(): number;
}

type Entry = { handle: Promise<SandboxHandle> | null; queue: Promise<unknown>; idle: NodeJS.Timeout | null; pending: number; closed: boolean };

export const CLOSED_MESSAGE = 'Python sandbox was closed';
const closedOutcome = (): RunOutcome => ({ stdout: '', result: null, error: CLOSED_MESSAGE, durationMs: 0 });

/**
 * One sandbox child per chat thread; runs in a thread are serialised; idle children are killed.
 * After closeAll() the pool is closed for good: run() returns a closed error and never spawns.
 * Callers that want to reuse the sandbox after closing must build a fresh pool.
 */
export function makeSandboxPool(o: { start: () => Promise<SandboxHandle>; idleMs?: number }): SandboxPool {
  const idleMs = o.idleMs ?? 600_000;
  const entries = new Map<string, Entry>();
  let closed = false;

  const killEntry = (threadId: string) => {
    const e = entries.get(threadId);
    if (!e) return;
    entries.delete(threadId);
    e.closed = true;
    if (e.idle) clearTimeout(e.idle);
    e.handle?.then((h) => h.kill(), () => {});
  };

  const dropIfIdle = (threadId: string, e: Entry) => {
    if (entries.get(threadId) !== e || e.pending > 0) return;
    if (e.handle === null) { entries.delete(threadId); return; }
    e.idle = setTimeout(() => killEntry(threadId), idleMs);
    e.idle.unref?.();
  };

  const runOnce = async (threadId: string, e: Entry, req: RunRequest): Promise<RunOutcome> => {
    if (e.closed) return closedOutcome();
    if (e.idle) { clearTimeout(e.idle); e.idle = null; }
    let handle: SandboxHandle;
    try {
      if (!e.handle) e.handle = o.start();
      handle = await e.handle;
      if (!handle.alive) { e.handle = o.start(); handle = await e.handle; }
    } catch (err) {
      e.handle = null;
      return { stdout: '', result: null, error: `The Python sandbox could not start: ${(err as Error).message}`, durationMs: 0 };
    }
    if (e.closed) { handle.kill(); return closedOutcome(); }
    try {
      const outcome = await handle.run(req);
      if (!handle.alive) e.handle = null;
      return outcome;
    } catch (err) {
      e.handle = null;
      return { stdout: '', result: null, error: `The Python sandbox failed: ${(err as Error).message}`, durationMs: 0 };
    }
  };

  return {
    run(threadId, req) {
      if (closed) return Promise.resolve(closedOutcome());
      let e = entries.get(threadId);
      if (!e) { e = { handle: null, queue: Promise.resolve(), idle: null, pending: 0, closed: false }; entries.set(threadId, e); }
      const entry = e;
      entry.pending++;
      const next = entry.queue.then(() => runOnce(threadId, entry, req)).finally(() => {
        entry.pending--;
        dropIfIdle(threadId, entry);
      });
      entry.queue = next.catch(() => {});
      return next;
    },
    closeAll() { closed = true; for (const id of [...entries.keys()]) killEntry(id); },
    size() { return entries.size; },
  };
}
