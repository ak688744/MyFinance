import { LlmError, type LlmConfig, type LlmProvider } from './types';
import { makeOpenAiCompatProvider } from './openaiCompat';
import { makeAnthropicProvider } from './anthropic';

export function resolveProvider(config: LlmConfig): LlmProvider {
  switch (config.dialect) {
    case 'openai-compatible':
      return makeOpenAiCompatProvider(config);
    case 'anthropic':
      return makeAnthropicProvider(config);
    case 'gemini':
      throw new LlmError('provider_not_configured', 'Gemini adapter wired in Task 2.3.');
    default:
      throw new LlmError('provider_not_configured', `Unknown dialect: ${(config as LlmConfig).dialect}`);
  }
}

export * from './types';
