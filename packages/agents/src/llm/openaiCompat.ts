import { LlmError, type LlmConfig, type LlmProvider } from './types';

// Drop-in slot: OpenAI + DeepSeek + Groq + OpenRouter + Ollama all speak this dialect.
// v1 not implemented — enabling later is config + this adapter, no new code elsewhere.
export function makeOpenAiCompatProvider(_config: LlmConfig): LlmProvider {
  return {
    async complete() {
      throw new LlmError('provider_not_configured', 'OpenAI-compatible provider not configured in v1.');
    },
  };
}
