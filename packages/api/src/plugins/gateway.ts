// packages/api/src/plugins/gateway.ts
import { decryptSecret } from '@myfinance/core';
import { makeLlmGateway } from '@myfinance/agents';
import type { Repos } from './db';

export function makeGateway(repos: Repos) {
  return makeLlmGateway({
    providerRepo: repos.aiProviderRepo,
    modelRepo: repos.aiModelRepo,
    routeRepo: repos.aiTaskRouteRepo,
    usageRepo: repos.aiUsageRepo,
    decrypt: (blob) => decryptSecret(blob),
  });
}
export type Gateway = ReturnType<typeof makeGateway>;
