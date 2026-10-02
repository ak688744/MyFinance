import { existsSync } from 'node:fs';
import { resolveSandboxPaths } from './paths';
import { ensureWheels } from './wheels';
import { buildLaunchSpec, SANDBOX_EXEC, UNAVAILABLE_MESSAGE } from './launch';
import { startSandbox, type RunOutcome } from './sandboxProcess';
import { makeSandboxPool } from './pool';
import { handleBridgeCall, BRIDGE_FUNCTION_NAMES } from './bridge';

export const SANDBOX_TIMEOUT_MS = 30_000;
export const SANDBOX_IDLE_MS = 600_000;
export const SANDBOX_MEM_CAP_MB = 512;

export interface SandboxRuntime {
  run(threadId: string, req: { code: string; datasets: Record<string, string> }): Promise<RunOutcome>;
  close(): void;
}

export function createSandboxRuntime(o: { platform?: NodeJS.Platform; timeoutMs?: number; idleMs?: number; memCapMb?: number } = {}): SandboxRuntime {
  const platform = o.platform ?? process.platform;
  const timeoutMs = o.timeoutMs ?? SANDBOX_TIMEOUT_MS;
  const memCapMb = o.memCapMb ?? SANDBOX_MEM_CAP_MB;
  let pool: ReturnType<typeof makeSandboxPool> | null = null;
  const getPool = () => {
    pool ??= makeSandboxPool({
      idleMs: o.idleMs ?? SANDBOX_IDLE_MS,
      start: async () => {
        const paths = resolveSandboxPaths();
        await ensureWheels(paths);
        const spec = buildLaunchSpec({
          platform, nodePath: process.execPath, paths, memCapMb,
          bridgeNames: BRIDGE_FUNCTION_NAMES, sandboxExecExists: existsSync(SANDBOX_EXEC),
        });
        if ('unavailable' in spec) throw new Error(spec.unavailable);
        return startSandbox({ spec, childEntry: paths.childEntry, bridge: handleBridgeCall, memCapMb });
      },
    });
    return pool;
  };
  const available = platform === 'darwin' && existsSync(SANDBOX_EXEC);
  return {
    async run(threadId, req) {
      // Fail closed: never spawn without the OS network deny (spec section 9).
      if (!available) return { stdout: '', result: null, error: UNAVAILABLE_MESSAGE, durationMs: 0 };
      return getPool().run(threadId, { ...req, timeoutMs });
    },
    // A closed pool rejects further runs, so drop it: a later run builds a fresh pool.
    close() { pool?.closeAll(); pool = null; },
  };
}

export { BRIDGE_DOCS, BRIDGE_FUNCTION_NAMES } from './bridge';
export type { RunOutcome } from './sandboxProcess';
