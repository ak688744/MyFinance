import { describe, it, expect } from 'vitest';
import { resolveRoute, AgentConfigError, type ResolverDeps } from '../src/modelResolver';

function fakeDeps(task: string, overrides: Partial<{
  route: any; model: any; provider: any; decrypt: (b: string) => string;
}> = {}): ResolverDeps {
  const route = 'route' in overrides ? overrides.route : { task, modelId: 'm1', updatedAt: 't' };
  const model = 'model' in overrides ? overrides.model
    : { id: 'm1', providerId: 'p1', modelString: 'gemini-1.5-flash', label: 'Flash', inputPerM: 0.1, outputPerM: 0.4, createdAt: 't' };
  const provider = 'provider' in overrides ? overrides.provider
    : { id: 'p1', dialect: 'gemini', label: 'Google', secretEnc: 'ENC', configJson: null, createdAt: 't' };
  return {
    routeRepo: { getByTask: (t: string) => (t === task ? route : null) } as any,
    modelRepo: { get: (id: string) => (id === (model?.id) ? model : null) } as any,
    providerRepo: { get: (id: string) => (id === (provider?.id) ? provider : null) } as any,
    decrypt: overrides.decrypt ?? ((b: string) => (b === 'ENC' ? 'plain-key' : '')),
  };
}

describe('resolveRoute(task)', () => {
  it('resolves the expense_agent route', () => {
    const r = resolveRoute(fakeDeps('expense_agent'), 'expense_agent');
    expect(r.dialect).toBe('gemini');
    expect(r.modelString).toBe('google/gemini-1.5-flash');
    expect(r.apiKey).toBe('plain-key');
    expect(r.inputPerM).toBe(0.1);
    expect(r.outputPerM).toBe(0.4);
  });

  it('throws not_configured when no route exists for the given task', () => {
    try {
      resolveRoute(fakeDeps('expense_agent', { route: null }), 'expense_agent');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentConfigError);
      expect((e as AgentConfigError).kind).toBe('not_configured');
    }
  });

  it('resolves a bedrock route for expense_agent', () => {
    const model = { id: 'm1', providerId: 'p1', modelString: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Haiku', inputPerM: 0.8, outputPerM: 4, createdAt: 't' };
    const provider = { id: 'p1', dialect: 'bedrock', label: 'AWS', secretEnc: null, configJson: '{"region":"us-east-1","profile":"dev"}', createdAt: 't' };
    const r = resolveRoute(fakeDeps('expense_agent', { model, provider }), 'expense_agent');
    expect(r.dialect).toBe('bedrock');
    expect(r.apiKey).toBeUndefined();
    expect(r.bedrock).toEqual({ region: 'us-east-1', profile: 'dev' });
  });
});
