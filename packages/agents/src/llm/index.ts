import { LlmError, type LlmConfig, type LlmProvider } from './types';
import { makeOpenAiCompatProvider } from './openaiCompat';
import { makeAnthropicProvider } from './anthropic';
import { makeGeminiProvider } from './gemini';

export function resolveProvider(config: LlmConfig): LlmProvider {
  switch (config.dialect) {
    case 'openai-compatible':
      return makeOpenAiCompatProvider(config);
    case 'anthropic':
      return makeAnthropicProvider(config);
    case 'gemini':
      return makeGeminiProvider(config);
    default:
      throw new LlmError('provider_not_configured', `Unknown dialect: ${(config as LlmConfig).dialect}`);
  }
}

export { buildProvider } from './factory';
export * from './types';
