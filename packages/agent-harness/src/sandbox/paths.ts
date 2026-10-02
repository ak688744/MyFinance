import { createRequire } from 'node:module';
import { mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export type SandboxPaths = {
  pyodideDir: string;
  pyodideEntryUrl: string;
  lockFile: string;
  wheelCache: string;
  childEntry: string;
  prefetchEntry: string;
};

/**
 * Every path is realpath-ed: the Node permission model (--allow-fs-read) checks
 * real paths, and pnpm installs node_modules/pyodide as a symlink into .pnpm/.
 */
export function resolveSandboxPaths(): SandboxPaths {
  const require = createRequire(import.meta.url);
  const pyodideDir = realpathSync(dirname(require.resolve('pyodide/package.json')));
  const cacheDir = resolve(here, '../../.pyodide-cache');
  mkdirSync(cacheDir, { recursive: true });
  return {
    pyodideDir,
    pyodideEntryUrl: pathToFileURL(join(pyodideDir, 'pyodide.mjs')).href,
    lockFile: join(pyodideDir, 'pyodide-lock.json'),
    wheelCache: realpathSync(cacheDir),
    childEntry: realpathSync(join(here, 'child.mjs')),
    prefetchEntry: realpathSync(join(here, 'prefetch.mjs')),
  };
}
