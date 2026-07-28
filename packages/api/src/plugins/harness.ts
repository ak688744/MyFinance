import { makeWealthHarness } from '@myfinance/agent-harness';
import { decryptSecret } from '@myfinance/core';
import type { Repos } from './db';

export type Harness = ReturnType<typeof makeWealthHarness>;

export function memoryUrlFor(dbPath: string): string {
  return dbPath === ':memory:' ? ':memory:' : `file:${dbPath}.memory.db`;
}

export function makeHarness(
  repos: Repos,
  opts: { dbPath: string; memoryUrl: string },
): Harness {
  return makeWealthHarness({
    routeRepo: repos.aiTaskRouteRepo,
    modelRepo: repos.aiModelRepo,
    providerRepo: repos.aiProviderRepo,
    usageRepo: repos.aiUsageRepo,
    decrypt: (blob: string) => decryptSecret(blob),
    dbPath: opts.dbPath,
    memoryUrl: opts.memoryUrl,
  });
}
