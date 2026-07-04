import { describe, it, expect } from 'vitest';
import { makeGeminiProvider } from '../src/llm/gemini';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

describe('gemini adapter', () => {
  it('returns text + usage from a successful response', async () => {
    const body = {
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5 },
    };
    const p = makeGeminiProvider(
      { dialect: 'gemini', model: 'gemini-flash', apiKey: 'k' },
      { fetchFn: fakeFetch(200, body) },
    );
    const res = await p.complete({ prompt: 'classify', jsonSchema: { type: 'object' } });
    expect(res.text).toBe('{"ok":true}');
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
  });

  it('maps 429 to rate_limit', async () => {
    const p = makeGeminiProvider(
      { dialect: 'gemini', model: 'gemini-flash', apiKey: 'k' },
      { fetchFn: fakeFetch(429, { error: { message: 'quota' } }) },
    );
    await expect(p.complete({ prompt: 'x', jsonSchema: {} })).rejects.toMatchObject({ kind: 'rate_limit' });
  });

  it('maps 403 to auth', async () => {
    const p = makeGeminiProvider(
      { dialect: 'gemini', model: 'gemini-flash', apiKey: 'k' },
      { fetchFn: fakeFetch(403, { error: { message: 'bad key' } }) },
    );
    await expect(p.complete({ prompt: 'x', jsonSchema: {} })).rejects.toMatchObject({ kind: 'auth' });
  });
});
