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

  it('wraps a non-object (array) schema in an object envelope, then unwraps the result', async () => {
    // Anthropic/Bedrock tool input_schema MUST be a root `object`. The
    // categorization schema is a top-level `array`, so the adapter must wrap it
    // for the request and unwrap the tool result back to the array.
    const ARRAY_SCHEMA = {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    };
    let captured: any;
    const client = { messages: { create: async (args: any) => { captured = args; return {
      // Bedrock returns the wrapped shape: { result: <the array> }
      content: [{ type: 'tool_use', name: 'emit', input: { result: [{ id: 1 }, { id: 2 }] } }],
      usage: { input_tokens: 5, output_tokens: 2 },
    }; } } };
    const p = makeBedrockProvider({ model: 'm', region: 'us-east-1' }, { client });
    const out = await p.complete({ prompt: 'hi', jsonSchema: ARRAY_SCHEMA });

    // Request: tool input_schema is a root object wrapping the array under `result`.
    expect(captured.tools[0].input_schema.type).toBe('object');
    expect(captured.tools[0].input_schema.properties.result).toEqual(ARRAY_SCHEMA);
    expect(captured.tools[0].input_schema.required).toEqual(['result']);
    // Result: unwrapped back to the original array shape the caller expects.
    expect(JSON.parse(out.text)).toEqual([{ id: 1 }, { id: 2 }]);
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
