// packages/agents/src/llm/bedrock.ts
import { LlmError, type LlmProvider } from './types';

const TOOL_NAME = 'emit_structured_output';

/** Minimal shape of AnthropicBedrock we depend on — injectable for offline tests. */
export interface BedrockLike {
  messages: { create(args: unknown): Promise<any> };
}

export function makeBedrockProvider(
  cfg: { model: string; region: string; profile?: string },
  deps: { client?: BedrockLike } = {},
): LlmProvider {
  return {
    async complete({ prompt, jsonSchema }) {
      let client = deps.client;
      if (!client) {
        // Lazy import so tests (which inject a client) never load the AWS SDK.
        const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
        const { fromSSO } = await import('@aws-sdk/credential-providers');
        client = new AnthropicBedrock({
          awsRegion: cfg.region,
          // providerChainResolver returns a credential provider function.
          // fromSSO reads the cached SSO token from `aws sso login --profile <profile>`.
          providerChainResolver: async () => fromSSO(cfg.profile ? { profile: cfg.profile } : {}),
        }) as unknown as BedrockLike;
      }

      let res: any;
      try {
        res = await client.messages.create({
          model: cfg.model,
          max_tokens: 4096,
          tools: [{
            name: TOOL_NAME,
            description: 'Return the answer as structured JSON matching the schema.',
            input_schema: jsonSchema,
          }],
          tool_choice: { type: 'tool', name: TOOL_NAME },
          messages: [{ role: 'user', content: prompt }],
        });
      } catch (e) {
        const name = (e as any)?.name ?? '';
        const msg = (e as Error)?.message ?? String(e);
        if (/Throttl|TooManyRequests|Rate/i.test(name)) throw new LlmError('rate_limit', `Bedrock throttled: ${msg}`);
        if (/AccessDenied|Unrecognized|ExpiredToken|Unauthor/i.test(name) || /expired|denied/i.test(msg)) {
          throw new LlmError('auth', `Bedrock auth failed (${msg}). Re-run: aws sso login --profile ${cfg.profile ?? 'dev'}.`);
        }
        throw new LlmError('network', `Bedrock request failed: ${msg}`);
      }

      const toolBlock = (res.content ?? []).find((b: any) => b.type === 'tool_use');
      const text = toolBlock ? JSON.stringify(toolBlock.input) : '';
      const usage = res.usage
        ? { inputTokens: res.usage.input_tokens ?? 0, outputTokens: res.usage.output_tokens ?? 0 }
        : undefined;
      return { text, usage };
    },
  };
}
