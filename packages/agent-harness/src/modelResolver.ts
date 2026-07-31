// Per-turn resolution of the wealth_chat route → Mastra model string + key.
// Mirrors the LlmGateway route→model→provider→decrypt logic (packages/agents/src/gateway.ts)
// but produces a Mastra 'provider/model' string + literal apiKey instead of an LlmProvider.
// SEAM: depends only on injected core repo interfaces + a decrypt fn — never Drizzle.

export type AiTaskRouteLike = { task: string; modelId: string; updatedAt: string } | null;
export type AiModelLike = {
  id: string; providerId: string; modelString: string; label: string;
  inputPerM: number; outputPerM: number; createdAt: string;
} | null;
export type AiProviderLike = {
  id: string; dialect: string; label: string;
  secretEnc: string | null; configJson: string | null; createdAt: string;
} | null;

export type ResolverDeps = {
  routeRepo: { getByTask: (task: string) => AiTaskRouteLike };
  modelRepo: { get: (id: string) => AiModelLike };
  providerRepo: { get: (id: string) => AiProviderLike };
  decrypt: (blob: string) => string;
};

export type BedrockConfig = { region: string; profile: string | undefined };

export type ResolvedRoute = {
  modelString: string;
  apiKey: string | undefined;
  dialect: string;
  inputPerM: number;
  outputPerM: number;
  providerId: string;
  /** Present only for the bedrock dialect (SSO — no apiKey). */
  bedrock?: BedrockConfig;
};

export class AgentConfigError extends Error {
  kind: 'not_configured' | 'unsupported_dialect';
  constructor(kind: 'not_configured' | 'unsupported_dialect', message: string) {
    super(message);
    this.name = 'AgentConfigError';
    this.kind = kind;
  }
}

const AGENT_SUPPORTED_DIALECTS = new Set(['gemini', 'openai-compatible', 'bedrock']);

export function toMastraModelString(dialect: string, modelString: string): string {
  if (dialect === 'gemini') {
    return modelString.includes('/') ? modelString : `google/${modelString}`;
  }
  if (dialect === 'openai-compatible') {
    return modelString.includes('/') ? modelString : `openai/${modelString}`;
  }
  return modelString;
}

const WEALTH_TASK = 'wealth_chat';

export function resolveWealthRoute(deps: ResolverDeps): ResolvedRoute {
  const route = deps.routeRepo.getByTask(WEALTH_TASK);
  if (!route) {
    throw new AgentConfigError(
      'not_configured',
      'No model is assigned to the wealth agent. Configure one in AI Settings → Routing (task "Wealth Chat Agent").',
    );
  }
  const model = deps.modelRepo.get(route.modelId);
  if (!model) {
    throw new AgentConfigError('not_configured', 'The wealth agent’s assigned model no longer exists. Reassign it in AI Settings.');
  }
  const provider = deps.providerRepo.get(model.providerId);
  if (!provider) {
    throw new AgentConfigError('not_configured', 'The wealth agent’s provider no longer exists. Reconfigure it in AI Settings.');
  }
  if (!AGENT_SUPPORTED_DIALECTS.has(provider.dialect)) {
    throw new AgentConfigError(
      'unsupported_dialect',
      `The wealth agent doesn’t support the "${provider.dialect}" provider yet — choose a Gemini, OpenAI-compatible, or Bedrock model in AI Settings.`,
    );
  }

  // Bedrock authenticates via the ambient AWS credential chain (SSO), not an API
  // key — mirroring the categorization Bedrock adapter. Region/profile live in
  // the provider's configJson (AI Settings stores no secret for bedrock).
  if (provider.dialect === 'bedrock') {
    const config = provider.configJson ? (JSON.parse(provider.configJson) as { region?: string; profile?: string }) : {};
    if (!config.region) {
      throw new AgentConfigError('not_configured', 'The wealth agent’s Bedrock provider has no AWS region. Set one in AI Settings.');
    }
    return {
      modelString: model.modelString,
      apiKey: undefined,
      dialect: provider.dialect,
      inputPerM: model.inputPerM,
      outputPerM: model.outputPerM,
      providerId: provider.id,
      bedrock: { region: config.region, profile: config.profile },
    };
  }

  const apiKey = provider.secretEnc ? deps.decrypt(provider.secretEnc) : undefined;
  if (!apiKey) {
    throw new AgentConfigError('not_configured', 'The wealth agent’s provider has no API key. Add one in AI Settings.');
  }
  return {
    modelString: toMastraModelString(provider.dialect, model.modelString),
    apiKey,
    dialect: provider.dialect,
    inputPerM: model.inputPerM,
    outputPerM: model.outputPerM,
    providerId: provider.id,
  };
}
