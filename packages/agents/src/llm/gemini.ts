import { LlmError, type LlmConfig, type LlmProvider } from './types';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function makeGeminiProvider(
  config: LlmConfig,
  deps: { fetchFn?: typeof fetch } = {},
): LlmProvider {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  if (!config.apiKey) {
    return { async complete() { throw new LlmError('provider_not_configured', 'GEMINI_API_KEY not set.'); } };
  }
  return {
    async complete({ prompt, jsonSchema }) {
      const base = config.baseURL ?? DEFAULT_BASE;
      const url = `${base}/models/${config.model}:generateContent?key=${config.apiKey}`;
      let res: Response;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: jsonSchema },
          }),
        });
      } catch (e) {
        throw new LlmError('network', `Gemini request failed: ${(e as Error).message}`);
      }
      if (!res.ok) {
        if (res.status === 429) throw new LlmError('rate_limit', 'Gemini rate limit (429).');
        if (res.status === 401 || res.status === 403) throw new LlmError('auth', `Gemini auth error (${res.status}).`);
        throw new LlmError('network', `Gemini error (${res.status}).`);
      }
      const data = (await res.json()) as any;
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const usage = data?.usageMetadata
        ? { inputTokens: data.usageMetadata.promptTokenCount ?? 0, outputTokens: data.usageMetadata.candidatesTokenCount ?? 0 }
        : undefined;
      return { text, usage };
    },
  };
}
