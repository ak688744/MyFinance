import { LlmError, type LlmProvider } from './types';
import { makeGeminiProvider } from './gemini';
import { makeBedrockProvider } from './bedrock';
import { makeOpenAiCompatProvider } from './openaiCompat';

export function buildProvider(input: {
  dialect: 'gemini' | 'openai-compatible' | 'bedrock';
  model: string;
  apiKey?: string;
  config?: { baseURL?: string; region?: string; profile?: string };
}): LlmProvider {
  switch (input.dialect) {
    case 'gemini':
      return makeGeminiProvider({ dialect: 'gemini', model: input.model, apiKey: input.apiKey ?? '', baseURL: input.config?.baseURL });
    case 'bedrock':
      return makeBedrockProvider({ model: input.model, region: input.config?.region ?? 'us-east-1', profile: input.config?.profile });
    case 'openai-compatible':
      return makeOpenAiCompatProvider({ dialect: 'openai-compatible', model: input.model, apiKey: input.apiKey ?? '', baseURL: input.config?.baseURL });
    default:
      throw new LlmError('provider_not_configured', `Unknown dialect: ${(input as any).dialect}`);
  }
}
