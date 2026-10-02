import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SandboxPaths } from './paths';

export const SANDBOX_PACKAGES = ['numpy', 'pandas'] as const;

export type PyodideLock = { packages: Record<string, { file_name: string; depends: string[] }> };

/** File names of the wheels needed for `roots`, dependencies included. */
export function requiredWheelFiles(lock: PyodideLock, roots: string[]): string[] {
  const seen = new Set<string>();
  const files = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const pkg = lock.packages[name];
    if (!pkg) throw new Error(`Package "${name}" is not in pyodide-lock.json`);
    files.add(pkg.file_name);
    for (const d of pkg.depends) visit(d);
  };
  roots.forEach(visit);
  return [...files].sort();
}

export function wheelsCached(paths: SandboxPaths): boolean {
  const lock = JSON.parse(readFileSync(paths.lockFile, 'utf8')) as PyodideLock;
  return requiredWheelFiles(lock, [...SANDBOX_PACKAGES]).every((f) => existsSync(join(paths.wheelCache, f)));
}

/** Fill the wheel cache with a trusted, network-enabled child. No-op when already cached. */
export async function ensureWheels(paths: SandboxPaths, opts: { timeoutMs?: number } = {}): Promise<void> {
  if (wheelsCached(paths)) return;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  await new Promise<void>((resolveP, rejectP) => {
    const child = spawn(process.execPath, [paths.prefetchEntry], {
      env: {
        MF_PYODIDE_ENTRY: paths.pyodideEntryUrl,
        MF_WHEEL_CACHE: paths.wheelCache,
        MF_PACKAGES: JSON.stringify(SANDBOX_PACKAGES),
        PATH: process.env.PATH ?? '',
      } as unknown as NodeJS.ProcessEnv,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr = (stderr + String(d)).slice(-2000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); rejectP(new Error(`Wheel prefetch timed out after ${timeoutMs} ms`)); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); rejectP(new Error(`Wheel prefetch failed to spawn: ${e.message}`)); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 && wheelsCached(paths)) resolveP();
      else rejectP(new Error(`Wheel prefetch failed (exit ${code}): ${stderr}`));
    });
  });
}
