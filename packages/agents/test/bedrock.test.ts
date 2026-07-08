// packages/agents/test/bedrock.test.ts
import { describe, it, expect } from 'vitest';
import { makeBedrockProvider } from '../src/llm/bedrock';
import { LlmError } from '../src/llm/types';

// Fake matching the subset of AnthropicBedrock.messages.create we use.
function fakeClient(response: any) {
  return { messages: { create: async () => response } };
}

const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };

describe('makeBedrockProvider', () => {
  it('forces tool-use and returns the tool input as JSON text + usage', async () => {
    let captured: any;
    const client = { messages: { create: async (args: any) => { captured = args; return {
      content: [{ type: 'tool_use', name: 'emit', input: { ok: true } }],
      usage: { input_tokens: 12, output_tokens: 3 },
    }; } } };
    const p = makeBedrockProvider({ model: 'us.anthropic.claude-haiku', region: 'us-east-1' }, { client });
    const out = await p.complete({ prompt: 'hi', jsonSchema: SCHEMA });
    expect(JSON.parse(out.text)).toEqual({ ok: true });
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    // tool_choice forces the single tool whose input_schema is our schema
    expect(captured.tool_choice.type).toBe('tool');
    expect(captured.tools[0].input_schema).toEqual(SCHEMA);
  });

  it('maps throttling to rate_limit and access-denied to auth', async () => {
    const throttle = makeBedrockProvider({ model: 'm', region: 'r' }, {
      client: { messages: { create: async () => { throw Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException' }); } } },
    });
    await expect(throttle.complete({ prompt: 'x', jsonSchema: SCHEMA }))
      .rejects.toMatchObject({ kind: 'rate_limit' });

    const denied = makeBedrockProvider({ model: 'm', region: 'r' }, {
      client: { messages: { create: async () => { throw Object.assign(new Error('expired token'), { name: 'AccessDeniedException' }); } } },
    });
    await expect(denied.complete({ prompt: 'x', jsonSchema: SCHEMA }))
      .rejects.toMatchObject({ kind: 'auth' });
  });
});
