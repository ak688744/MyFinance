import { describe, it, expect } from 'vitest';
import { buildLaunchSpec, SANDBOX_PROFILE, SANDBOX_EXEC, UNAVAILABLE_MESSAGE } from '../../src/sandbox/launch';

const paths = {
  pyodideDir: '/real/pyodide', pyodideEntryUrl: 'file:///real/pyodide/pyodide.mjs', lockFile: '/real/pyodide/pyodide-lock.json',
  wheelCache: '/real/cache', childEntry: '/real/src/sandbox/child.mjs', prefetchEntry: '/real/src/sandbox/prefetch.mjs',
};
const base = { nodePath: '/n/node', paths, memCapMb: 512, bridgeNames: ['xirr'], sandboxExecExists: true };

describe('buildLaunchSpec', () => {
  it('wraps node in sandbox-exec with the permission and no-codegen flags on darwin', () => {
    const spec = buildLaunchSpec({ ...base, platform: 'darwin' });
    if ('unavailable' in spec) throw new Error('expected a spec');
    expect(spec.execPath).toBe(SANDBOX_EXEC);
    expect(spec.execArgv).toEqual([
      '-p', SANDBOX_PROFILE, '/n/node',
      '--disallow-code-generation-from-strings', '--permission',
      '--allow-fs-read=/real/pyodide', '--allow-fs-read=/real/cache', '--allow-fs-read=/real/src/sandbox/child.mjs',
    ]);
  });
  it('grants no write, child-process, worker or addon permission', () => {
    const spec = buildLaunchSpec({ ...base, platform: 'darwin' }) as { execArgv: string[] };
    expect(spec.execArgv.join(' ')).not.toMatch(/allow-fs-write|allow-child-process|allow-worker|allow-addons|allow-wasi/);
  });
  it('passes only MF_* variables, never the parent environment', () => {
    const spec = buildLaunchSpec({ ...base, platform: 'darwin' }) as { env: Record<string, string> };
    expect(Object.keys(spec.env).sort()).toEqual(['MF_BRIDGE_FUNCTIONS', 'MF_MEM_CAP_MB', 'MF_PYODIDE_ENTRY', 'MF_WHEEL_CACHE']);
    expect(spec.env.MF_BRIDGE_FUNCTIONS).toBe('["xirr"]');
    expect(spec.env.MF_MEM_CAP_MB).toBe('512');
  });
  it('fails closed off darwin and when sandbox-exec is missing', () => {
    expect(buildLaunchSpec({ ...base, platform: 'linux' })).toEqual({ unavailable: UNAVAILABLE_MESSAGE });
    expect(buildLaunchSpec({ ...base, platform: 'darwin', sandboxExecExists: false })).toEqual({ unavailable: UNAVAILABLE_MESSAGE });
  });
});
