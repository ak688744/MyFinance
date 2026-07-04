import type { LlmConfig } from '@myfinance/agents';

export type ApiConfig = {
  dbPath: string;
  port: number;
  llm: { categorization: LlmConfig | null };
};

/**
 * Typed env loader. Reads DB_PATH and PORT from the environment, with defaults
 * suitable for local single-user dev.
 */
export function loadConfig(): ApiConfig {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  const categorization: LlmConfig | null = apiKey
    ? {
        dialect: (process.env.AI_CATEGORIZATION_DIALECT as LlmConfig['dialect']) ?? 'gemini',
        model: process.env.AI_CATEGORIZATION_MODEL ?? 'gemini-1.5-flash',
        apiKey,
        ...(process.env.AI_CATEGORIZATION_BASE_URL ? { baseURL: process.env.AI_CATEGORIZATION_BASE_URL } : {}),
      }
    : null;

  return {
    dbPath: process.env.DB_PATH ?? 'myfinance.db',
    port: Number(process.env.PORT ?? 3001),
    llm: { categorization },
  };
}
