import type { SandboxPaths } from './paths';

export const SANDBOX_PROFILE = '(version 1)(allow default)(deny network*)';
export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
export const UNAVAILABLE_MESSAGE = 'Python sandbox unavailable on this platform (needs macOS sandbox-exec).';

export type LaunchSpec = { execPath: string; execArgv: string[]; env: Record<string, string> };

/**
 * Flags from the 2026-09-30 capability probe (spec section 9). The child can read only
 * the pyodide package, the wheel cache and its own entry file; it cannot write
 * files, spawn processes or evaluate strings as code. sandbox-exec denies network.
 */
export function buildLaunchSpec(o: {
  platform: NodeJS.Platform;
  nodePath: string;
  paths: SandboxPaths;
  memCapMb: number;
  bridgeNames: readonly string[];
  sandboxExecExists: boolean;
}): LaunchSpec | { unavailable: string } {
  if (o.platform !== 'darwin' || !o.sandboxExecExists) return { unavailable: UNAVAILABLE_MESSAGE };
  const nodeFlags = [
    '--disallow-code-generation-from-strings',
    '--permission',
    `--allow-fs-read=${o.paths.pyodideDir}`,
    `--allow-fs-read=${o.paths.wheelCache}`,
    `--allow-fs-read=${o.paths.childEntry}`,
  ];
  return {
    execPath: SANDBOX_EXEC,
    execArgv: ['-p', SANDBOX_PROFILE, o.nodePath, ...nodeFlags],
    env: {
      MF_PYODIDE_ENTRY: o.paths.pyodideEntryUrl,
      MF_WHEEL_CACHE: o.paths.wheelCache,
      MF_MEM_CAP_MB: String(o.memCapMb),
      MF_BRIDGE_FUNCTIONS: JSON.stringify(o.bridgeNames),
    },
  };
}
