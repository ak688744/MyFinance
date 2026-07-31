// Builds the Mastra `model` value for the wealth agent from a resolved route.
//
// - gemini / openai-compatible: Mastra's object form { id, apiKey } — the model
//   router reads the provider from the 'provider/model' string and the literal key.
// - bedrock: an @ai-sdk/amazon-bedrock model INSTANCE built with per-turn SSO
//   credentials (createAmazonBedrock accepts a credentialProvider returning creds
//   WITHOUT region). Verified against Mastra + live AWS in the L4.1 capability spike.
//
// The AWS builders are injectable so unit tests stay fully offline (no SDK load,
// no network). The defaults lazy-import the SDKs only when a bedrock route runs.
import type { ResolvedRoute } from './modelResolver';

/** Credentials without `region` — the shape createAmazonBedrock's credentialProvider wants. */
export type BedrockCreds = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

export type BedrockModelFactory = (cfg: {
  region: string;
  credentialProvider: () => Promise<BedrockCreds>;
}) => (modelId: string) => unknown;

export type AgentModelDeps = {
  createBedrock?: BedrockModelFactory;
  ssoCredentials?: (opts: { profile?: string }) => Promise<{
    accessKeyId: string; secretAccessKey: string; sessionToken?: string; region?: string;
  }>;
};

async function defaultCreateBedrock(): Promise<BedrockModelFactory> {
  const { createAmazonBedrock } = await import('@ai-sdk/amazon-bedrock');
  return (cfg) => createAmazonBedrock(cfg as any) as unknown as (modelId: string) => unknown;
}

async function defaultSsoCredentials(opts: { profile?: string }) {
  const { fromSSO } = await import('@aws-sdk/credential-providers');
  return fromSSO(opts.profile ? { profile: opts.profile } : {})();
}

export function buildAgentModel(route: ResolvedRoute, deps: AgentModelDeps = {}): unknown {
  if (route.dialect !== 'bedrock') {
    return { id: route.modelString, apiKey: route.apiKey };
  }

  if (!route.bedrock) {
    throw new Error('buildAgentModel: bedrock route is missing its bedrock config.');
  }
  const { region, profile } = route.bedrock;

  const credentialProvider = async (): Promise<BedrockCreds> => {
    const load = deps.ssoCredentials ?? defaultSsoCredentials;
    const creds = await load(profile ? { profile } : {});
    // createAmazonBedrock wants creds WITHOUT `region` (Omit<BedrockCredentials,'region'>).
    return {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    };
  };

  // When no factory is injected, the default is async — resolve it, then build.
  // We return the model synchronously by requiring the injected factory in tests
  // and lazily resolving the SDK factory otherwise.
  if (deps.createBedrock) {
    return deps.createBedrock({ region, credentialProvider })(route.modelString);
  }
  // Default path: defer SDK load. buildAgentModel stays sync for the injected/test
  // path; the live path returns a thenable the caller awaits.
  return (async () => {
    const factory = await defaultCreateBedrock();
    return factory({ region, credentialProvider })(route.modelString);
  })();
}
