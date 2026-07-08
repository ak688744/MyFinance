import type {
  AiProviderRepo, AiModelRepo, AiTaskRouteRepo, AiUsageRepo,
} from '@myfinance/core';
import { LlmError, type LlmProvider, type LlmUsage } from './llm/types';
import { buildProvider } from './llm/factory';
import { costUsd } from './pricing';

export type CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>;

export type GatewayDeps = {
  providerRepo: AiProviderRepo;
  modelRepo: AiModelRepo;
  routeRepo: AiTaskRouteRepo;
  usageRepo: AiUsageRepo;
  decrypt: (blob: string) => string;
  now?: () => string;
  // Injectable test seam: override the concrete provider builder to avoid real network/SDK.
  buildProvider?: (args: { dialect: string; model: string; apiKey?: string; config?: any }) => LlmProvider;
};

export function makeLlmGateway(deps: GatewayDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const build = deps.buildProvider ?? buildProvider;

  return {
    async runTask<T>(task: string, fn: (complete: CompleteFn) => Promise<T>): Promise<T> {
      const route = deps.routeRepo.getByTask(task);
      if (!route) throw new LlmError('provider_not_configured', `Task "${task}" has no model assigned. Configure it in AI Settings.`);
      const model = deps.modelRepo.get(route.modelId);
      if (!model) throw new LlmError('provider_not_configured', `Model "${route.modelId}" for task "${task}" no longer exists.`);
      const provider = deps.providerRepo.get(model.providerId);
      if (!provider) throw new LlmError('provider_not_configured', `Provider "${model.providerId}" no longer exists.`);

      const config = provider.configJson ? JSON.parse(provider.configJson) : {};
      const apiKey = provider.secretEnc ? deps.decrypt(provider.secretEnc) : undefined;
      const built: LlmProvider = build({ dialect: provider.dialect, model: model.modelString, apiKey, config });

      let inputTokens = 0, outputTokens = 0, callCount = 0;
      const complete: CompleteFn = async (input) => {
        callCount += 1;
        const out = await built.complete(input);
        if (out.usage) { inputTokens += out.usage.inputTokens; outputTokens += out.usage.outputTokens; }
        return out;
      };

      const record = (ok: 0 | 1) => {
        deps.usageRepo.insert({
          ts: now(), task, providerId: provider.id, dialect: provider.dialect, model: model.modelString,
          inputTokens, outputTokens, callCount,
          costUsd: costUsd(inputTokens, outputTokens, model.inputPerM, model.outputPerM),
          ok,
        });
      };

      try {
        const result = await fn(complete);
        record(1);
        return result;
      } catch (e) {
        record(0);
        throw e;
      }
    },
  };
}
