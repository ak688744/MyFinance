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
      const url = `${base}/models/${encodeURIComponent(config.model)}:generateContent`;
      let res: Response;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: jsonSchema },
          }),
        });
      } catch (e) {
        throw new LlmError('network', `Gemini request failed: ${(e as Error).message}`);
      }
      if (!res.ok) {
        // Include Gemini's own error message — it explains WHY (e.g. a 404 says the
        // model isn't found for the API version), which is otherwise invisible.
        let apiMessage = '';
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          apiMessage = body?.error?.message ? ` — ${body.error.message}` : '';
        } catch {
          /* non-JSON error body; status alone will have to do */
        }
        if (res.status === 429) throw new LlmError('rate_limit', `Gemini rate limit (429)${apiMessage}`);
        if (res.status === 401 || res.status === 403) throw new LlmError('auth', `Gemini auth error (${res.status})${apiMessage}`);
        throw new LlmError('network', `Gemini error (${res.status})${apiMessage}`);
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
