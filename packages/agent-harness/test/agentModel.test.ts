import { describe, it, expect } from 'vitest';
import { buildAgentModel } from '../src/agentModel';
import type { ResolvedRoute } from '../src/modelResolver';

const nonBedrock: ResolvedRoute = {
  modelString: 'google/gemini-2.5-flash',
  apiKey: 'plain-key',
  dialect: 'gemini',
  inputPerM: 1,
  outputPerM: 2,
  providerId: 'p1',
};

const bedrockRoute: ResolvedRoute = {
  modelString: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  apiKey: undefined,
  dialect: 'bedrock',
  inputPerM: 0.8,
  outputPerM: 4,
  providerId: 'p1',
  bedrock: { region: 'us-east-1', profile: 'dev' },
};

describe('buildAgentModel', () => {
  it('returns the Mastra object form {id, apiKey} for non-bedrock dialects', () => {
    const m = buildAgentModel(nonBedrock);
    expect(m).toEqual({ id: 'google/gemini-2.5-flash', apiKey: 'plain-key' });
  });

  it('builds a bedrock model instance via the injected provider factory + SSO creds', async () => {
    const calls: any = {};
    const fakeModelInstance = { __isModel: true };
    const m = buildAgentModel(bedrockRoute, {
      createBedrock: (cfg) => {
        calls.createCfg = cfg;
        return (modelId: string) => {
          calls.modelId = modelId;
          return fakeModelInstance as any;
        };
      },
      ssoCredentials: async (opts) => {
        calls.ssoOpts = opts;
        return { accessKeyId: 'AK', secretAccessKey: 'SK', sessionToken: 'ST', region: 'us-east-1' } as any;
      },
    });

    expect(m).toBe(fakeModelInstance);
    expect(calls.modelId).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(calls.createCfg.region).toBe('us-east-1');

    // credentialProvider must resolve creds via SSO and strip `region`
    const creds = await calls.createCfg.credentialProvider();
    expect(calls.ssoOpts).toEqual({ profile: 'dev' });
    expect(creds).toEqual({ accessKeyId: 'AK', secretAccessKey: 'SK', sessionToken: 'ST' });
  });

  it('passes empty SSO opts when no profile is set', async () => {
    const calls: any = {};
    buildAgentModel(
      { ...bedrockRoute, bedrock: { region: 'ap-south-1', profile: undefined } },
      {
        createBedrock: (cfg) => { calls.createCfg = cfg; return () => ({} as any); },
        ssoCredentials: async (opts) => { calls.ssoOpts = opts; return { accessKeyId: 'a', secretAccessKey: 'b', sessionToken: 'c' } as any; },
      },
    );
    await calls.createCfg.credentialProvider();
    expect(calls.ssoOpts).toEqual({});
  });

  it('throws if a bedrock route is missing its bedrock config', () => {
    expect(() => buildAgentModel({ ...bedrockRoute, bedrock: undefined })).toThrow();
  });
});
