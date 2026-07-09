import { describe, it, expect } from 'vitest';
import { buildProvider } from '../src/llm/factory';
import { LlmError } from '../src/llm/types';

describe('buildProvider', () => {
  it('builds gemini with a key', () => {
    const p = buildProvider({ dialect: 'gemini', model: 'gemini-2.5-flash', apiKey: 'k' });
    expect(typeof p.complete).toBe('function');
  });
  it('builds bedrock with region/profile and NO secret', () => {
    const p = buildProvider({ dialect: 'bedrock', model: 'us.anthropic.claude-haiku', config: { region: 'us-east-1', profile: 'dev' } });
    expect(typeof p.complete).toBe('function');
  });
  it('openai-compatible still not implemented → provider_not_configured on use', async () => {
    const p = buildProvider({ dialect: 'openai-compatible', model: 'x', apiKey: 'k' });
    await expect(p.complete({ prompt: 'x', jsonSchema: {} })).rejects.toBeInstanceOf(LlmError);
  });
});
