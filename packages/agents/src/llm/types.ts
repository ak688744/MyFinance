export type LlmDialect = 'gemini' | 'openai-compatible' | 'anthropic';

export type LlmConfig = {
  dialect: LlmDialect;
  model: string;
  apiKey: string;
  baseURL?: string;
};

export type LlmErrorKind =
  | 'provider_not_configured'
  | 'network'
  | 'rate_limit'
  | 'invalid_output'
  | 'auth';

export class LlmError extends Error {
  kind: LlmErrorKind;
  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
  }
}

export type LlmUsage = { inputTokens: number; outputTokens: number };

export interface LlmProvider {
  complete(input: { prompt: string; jsonSchema: object }): Promise<{ text: string; usage?: LlmUsage }>;
}
