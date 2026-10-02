import { existsSync } from 'node:fs';
import { resolveSandboxPaths } from '../../src/sandbox/paths';
import { wheelsCached } from '../../src/sandbox/wheels';

export const SANDBOX_RUNNABLE =
  process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec') && wheelsCached(resolveSandboxPaths());

/**
 * Set MF_REQUIRE_SANDBOX=1 (CI, release checks) to make the sandbox suites FAIL instead of
 * skipping when the sandbox cannot run. Unset (default): skip with a warning.
 */
export const SANDBOX_REQUIRED = process.env.MF_REQUIRE_SANDBOX === '1';

if (!SANDBOX_RUNNABLE) {
  console.warn('[sandbox tests] SKIPPED: needs macOS sandbox-exec and cached wheels (run pnpm sandbox:prepare).');
}

import { buildLaunchSpec, type LaunchSpec } from '../../src/sandbox/launch';

/** Real launch spec for integration tests; throws when the sandbox is unavailable. */
export function testSpec(bridgeNames: readonly string[] = ['echo']): LaunchSpec {
  const spec = buildLaunchSpec({
    platform: process.platform,
    nodePath: process.execPath,
    paths: resolveSandboxPaths(),
    memCapMb: 512,
    bridgeNames,
    sandboxExecExists: existsSync('/usr/bin/sandbox-exec'),
  });
  if ('unavailable' in spec) throw new Error(spec.unavailable);
  return spec;
}
