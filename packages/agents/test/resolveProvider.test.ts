import { describe, it, expect } from 'vitest';
import { resolveProvider } from '../src/llm/index';
import { LlmError } from '../src/llm/types';

describe('resolveProvider', () => {
  it('openai-compatible stub throws provider_not_configured', async () => {
    const p = resolveProvider({ dialect: 'openai-compatible', model: 'x', apiKey: 'k' });
    await expect(p.complete({ prompt: 'hi', jsonSchema: {} })).rejects.toMatchObject({
      name: 'LlmError', kind: 'provider_not_configured',
    });
    expect(LlmError).toBeDefined();
  });

  it('anthropic stub throws provider_not_configured', async () => {
    const p = resolveProvider({ dialect: 'anthropic', model: 'x', apiKey: 'k' });
    await expect(p.complete({ prompt: 'hi', jsonSchema: {} })).rejects.toMatchObject({
      kind: 'provider_not_configured',
    });
  });
});
