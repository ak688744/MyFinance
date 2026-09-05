import { describe, it, expect } from 'vitest';
import {
  resolveWealthRoute,
  toMastraModelString,
  AgentConfigError,
  type ResolverDeps,
} from '../src/modelResolver';

function fakeDeps(overrides: Partial<{
  route: any; model: any; provider: any; decrypt: (b: string) => string;
}> = {}): ResolverDeps {
  const route = 'route' in overrides ? overrides.route : { task: 'wealth_chat', modelId: 'm1', updatedAt: 't' };
  const model = 'model' in overrides ? overrides.model
    : { id: 'm1', providerId: 'p1', modelString: 'gemini-2.5-flash', label: 'Flash', inputPerM: 0.1, outputPerM: 0.4, createdAt: 't' };
  const provider = 'provider' in overrides ? overrides.provider
    : { id: 'p1', dialect: 'gemini', label: 'Google', secretEnc: 'ENC', configJson: null, createdAt: 't' };
  return {
    routeRepo: { getByTask: (t: string) => (t === 'wealth_chat' ? route : null) } as any,
    modelRepo: { get: (id: string) => (id === (model?.id) ? model : null) } as any,
    providerRepo: { get: (id: string) => (id === (provider?.id) ? provider : null) } as any,
    decrypt: overrides.decrypt ?? ((b: string) => (b === 'ENC' ? 'plain-key' : '')),
  };
}

describe('resolveWealthRoute', () => {
  it('resolves a gemini route to model string + decrypted key', () => {
    const r = resolveWealthRoute(fakeDeps());
    expect(r.modelString).toBe('google/gemini-2.5-flash');
    expect(r.apiKey).toBe('plain-key');
    expect(r.dialect).toBe('gemini');
    expect(r.inputPerM).toBe(0.1);
    expect(r.outputPerM).toBe(0.4);
    expect(r.providerId).toBe('p1');
  });

  it('throws not_configured when no route exists', () => {
    try {
      resolveWealthRoute(fakeDeps({ route: null }));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentConfigError);
      expect((e as AgentConfigError).kind).toBe('not_configured');
    }
  });

  it('throws not_configured when the provider has no key', () => {
    const provider = { id: 'p1', dialect: 'gemini', label: 'G', secretEnc: null, configJson: null, createdAt: 't' };
    try {
      resolveWealthRoute(fakeDeps({ provider }));
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as AgentConfigError).kind).toBe('not_configured');
    }
  });

  it('resolves a bedrock route from configJson region/profile (no apiKey, SSO)', () => {
    const model = { id: 'm1', providerId: 'p1', modelString: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Haiku', inputPerM: 0.8, outputPerM: 4, createdAt: 't' };
    const provider = { id: 'p1', dialect: 'bedrock', label: 'AWS', secretEnc: null, configJson: '{"region":"us-east-1","profile":"dev"}', createdAt: 't' };
    const r = resolveWealthRoute(fakeDeps({ model, provider }));
    expect(r.dialect).toBe('bedrock');
    expect(r.apiKey).toBeUndefined();
    expect(r.modelString).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(r.bedrock).toEqual({ region: 'us-east-1', profile: 'dev' });
    expect(r.inputPerM).toBe(0.8);
    expect(r.providerId).toBe('p1');
  });

  it('resolves a bedrock route with no profile (default SSO chain)', () => {
    const provider = { id: 'p1', dialect: 'bedrock', label: 'AWS', secretEnc: null, configJson: '{"region":"ap-south-1"}', createdAt: 't' };
    const r = resolveWealthRoute(fakeDeps({ provider }));
    expect(r.bedrock).toEqual({ region: 'ap-south-1', profile: undefined });
  });

  it('throws not_configured when a bedrock provider has no region', () => {
    const provider = { id: 'p1', dialect: 'bedrock', label: 'AWS', secretEnc: null, configJson: '{"profile":"dev"}', createdAt: 't' };
    try {
      resolveWealthRoute(fakeDeps({ provider }));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentConfigError);
      expect((e as AgentConfigError).kind).toBe('not_configured');
    }
  });

  it('still throws unsupported_dialect for a genuinely unsupported dialect', () => {
    const provider = { id: 'p1', dialect: 'cohere', label: 'Cohere', secretEnc: 'ENC', configJson: null, createdAt: 't' };
    try {
      resolveWealthRoute(fakeDeps({ provider }));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentConfigError);
      expect((e as AgentConfigError).kind).toBe('unsupported_dialect');
    }
  });
});

describe('toMastraModelString', () => {
  it('maps gemini dialect to google/ prefix', () => {
    expect(toMastraModelString('gemini', 'gemini-2.5-flash')).toBe('google/gemini-2.5-flash');
  });
  it('passes an already-prefixed openai-compatible model through', () => {
    expect(toMastraModelString('openai-compatible', 'openai/gpt-4o-mini')).toBe('openai/gpt-4o-mini');
  });
  it('prefixes a bare openai-compatible model with openai/', () => {
    expect(toMastraModelString('openai-compatible', 'gpt-4o-mini')).toBe('openai/gpt-4o-mini');
  });
});
