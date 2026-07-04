import { LlmError, type LlmConfig, type LlmProvider } from './types';

// Reserved for the L4 Claude Agent SDK path.
export function makeAnthropicProvider(_config: LlmConfig): LlmProvider {
  return {
    async complete() {
      throw new LlmError('provider_not_configured', 'Anthropic provider not configured in v1.');
    },
  };
}
