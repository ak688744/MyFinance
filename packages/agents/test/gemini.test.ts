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

  it('sends the api key as x-goog-api-key header, not in the URL', async () => {
    let capturedUrl = '';
    let capturedInit: any = null;
    const fetchFn = (async (url: string, init: any) => {
      capturedUrl = url;
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
        text: async () => '{}',
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const p = makeGeminiProvider({ dialect: 'gemini', model: 'gemini-1.5-flash', apiKey: 'secret-key' }, { fetchFn });
    await p.complete({ prompt: 'x', jsonSchema: {} });
    expect(capturedUrl).not.toContain('key=');
    expect(capturedInit.headers['x-goog-api-key']).toBe('secret-key');
  });
});
