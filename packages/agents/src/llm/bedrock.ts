// packages/agents/src/llm/bedrock.ts
import { LlmError, type LlmProvider } from './types';

const TOOL_NAME = 'emit_structured_output';
// Envelope key used when the caller's schema is not a top-level object (see below).
const WRAP_KEY = 'result';

/** Minimal shape of AnthropicBedrock we depend on — injectable for offline tests. */
export interface BedrockLike {
  messages: { create(args: unknown): Promise<any> };
}

/**
 * Anthropic/Bedrock tool-use requires the tool's `input_schema` to be a JSON
 * Schema whose root `type` is `object`. Some callers pass a non-object root
 * (e.g. the categorization schema is a top-level `array`, which Gemini's
 * responseSchema accepts). When that happens we wrap the schema in a
 * single-property object envelope for the tool, then unwrap it from the
 * tool_use result so `complete()` still returns JSON matching the ORIGINAL
 * schema. Object schemas pass through untouched.
 */
function needsWrap(schema: any): boolean {
  return !schema || typeof schema !== 'object' || schema.type !== 'object';
}

function toolInputSchema(schema: any): object {
  if (!needsWrap(schema)) return schema;
  return {
    type: 'object',
    properties: { [WRAP_KEY]: schema },
    required: [WRAP_KEY],
  };
}

function unwrapToolInput(input: any, schema: any): unknown {
  return needsWrap(schema) ? input?.[WRAP_KEY] : input;
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
            input_schema: toolInputSchema(jsonSchema),
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
      const text = toolBlock ? JSON.stringify(unwrapToolInput(toolBlock.input, jsonSchema)) : '';
      const usage = res.usage
        ? { inputTokens: res.usage.input_tokens ?? 0, outputTokens: res.usage.output_tokens ?? 0 }
        : undefined;
      return { text, usage };
    },
  };
}
