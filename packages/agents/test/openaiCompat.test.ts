import { describe, it, expect } from 'vitest';
import { makeOpenAiCompatProvider } from '../src/llm/openaiCompat';
import { LlmError } from '../src/llm/types';

const cfg = { dialect: 'openai-compatible' as const, model: 'anthropic/claude-sonnet-4.5', apiKey: 'k', baseURL: 'https://openrouter.ai/api/v1/' };
const okFetch = (capture: any) => (async (url: string, init: any) => {
  capture.url = url; capture.init = init;
  return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
}) as unknown as typeof fetch;

describe('openai-compatible provider', () => {
  it('posts to {baseURL}/chat/completions with bearer auth + json_schema and maps usage', async () => {
    const cap: any = {};
    const p = makeOpenAiCompatProvider(cfg, { fetchFn: okFetch(cap) });
    const r = await p.complete({ prompt: 'hi', jsonSchema: { type: 'object' } });
    expect(cap.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(cap.init.headers.authorization).toBe('Bearer k');
    const body = JSON.parse(cap.init.body);
    expect(body.model).toBe('anthropic/claude-sonnet-4.5');
    expect(body.response_format.type).toBe('json_schema');
    expect(r).toEqual({ text: '{"a":1}', usage: { inputTokens: 10, outputTokens: 5 } });
  });

  it('defaults to the OpenAI base URL', async () => {
    const cap: any = {};
    const p = makeOpenAiCompatProvider({ ...cfg, baseURL: undefined }, { fetchFn: okFetch(cap) });
    await p.complete({ prompt: 'x', jsonSchema: {} });
    expect(cap.url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it.each([[429, 'rate_limit'], [401, 'auth'], [403, 'auth'], [500, 'network']])('maps HTTP %i to %s', async (status, kind) => {
    const f = (async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status })) as unknown as typeof fetch;
    const p = makeOpenAiCompatProvider(cfg, { fetchFn: f });
    await expect(p.complete({ prompt: 'x', jsonSchema: {} })).rejects.toMatchObject({ kind });
  });

  it('maps a thrown fetch to network', async () => {
    const f = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
    await expect(makeOpenAiCompatProvider(cfg, { fetchFn: f }).complete({ prompt: 'x', jsonSchema: {} })).rejects.toMatchObject({ kind: 'network' });
  });

  it('without a key → provider_not_configured', async () => {
    const p = makeOpenAiCompatProvider({ ...cfg, apiKey: '' });
    await expect(p.complete({ prompt: 'x', jsonSchema: {} })).rejects.toBeInstanceOf(LlmError);
  });
});
