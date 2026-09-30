import { LlmError, type LlmConfig, type LlmProvider } from './types';

const DEFAULT_BASE = 'https://api.openai.com/v1';

// OpenAI chat-completions dialect. OpenAI, OpenRouter, DeepSeek, Groq and Ollama all
// speak it — pointing at one is config only (baseURL), e.g. OpenRouter =
// https://openrouter.ai/api/v1.
export function makeOpenAiCompatProvider(
  config: LlmConfig,
  deps: { fetchFn?: typeof fetch } = {},
): LlmProvider {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  if (!config.apiKey) {
    return { async complete() { throw new LlmError('provider_not_configured', 'API key not set for OpenAI-compatible provider.'); } };
  }
  return {
    async complete({ prompt, jsonSchema }) {
      const base = (config.baseURL ?? DEFAULT_BASE).replace(/\/+$/, '');
      let res: Response;
      try {
        res = await fetchFn(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_schema', json_schema: { name: 'response', schema: jsonSchema } },
          }),
        });
      } catch (e) {
        throw new LlmError('network', `OpenAI-compatible request failed: ${(e as Error).message}`);
      }
      if (!res.ok) {
        let apiMessage = '';
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          apiMessage = body?.error?.message ? ` — ${body.error.message}` : '';
        } catch {
          /* non-JSON error body */
        }
        if (res.status === 429) throw new LlmError('rate_limit', `Rate limit (429)${apiMessage}`);
        if (res.status === 401 || res.status === 403) throw new LlmError('auth', `Auth error (${res.status})${apiMessage}`);
        throw new LlmError('network', `Provider error (${res.status})${apiMessage}`);
      }
      const data = (await res.json()) as any;
      const text: string = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage
        ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 }
        : undefined;
      return { text, usage };
    },
  };
}
