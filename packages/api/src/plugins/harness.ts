import { makeWealthHarness } from '@myfinance/agent-harness';
import { decryptSecret } from '@myfinance/core';
import type { DatasetResolver } from '@myfinance/agent-harness';
import type { Repos } from './db';

export type Harness = Pick<ReturnType<typeof makeWealthHarness>, 'runChat'> & { close?: () => void };

export function memoryUrlFor(dbPath: string): string {
  return dbPath === ':memory:' ? ':memory:' : `file:${dbPath}.memory.db`;
}

export function makeHarness(
  repos: Repos,
  opts: { dbPath: string; memoryUrl: string; resolveDataset?: DatasetResolver },
): Harness {
  return makeWealthHarness({
    routeRepo: repos.aiTaskRouteRepo,
    modelRepo: repos.aiModelRepo,
    providerRepo: repos.aiProviderRepo,
    usageRepo: repos.aiUsageRepo,
    decrypt: (blob: string) => decryptSecret(blob),
    dbPath: opts.dbPath,
    memoryUrl: opts.memoryUrl,
    resolveDataset: opts.resolveDataset,
  });
}
