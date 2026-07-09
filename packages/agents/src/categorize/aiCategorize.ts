import { LlmError, type LlmUsage } from '../llm/types';
import {
  AiSuggestionBatchSchema, GEMINI_RESPONSE_SCHEMA, type AiSuggestion,
} from './schema';
import { buildCategorizationPrompt, type TxnForPrompt, type CategoryForPrompt } from './prompt';

export type CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>;

export type CategorizeResult = {
  suggestions: AiSuggestion[];
  skipped: number;
  usage: { inputTokens: number; outputTokens: number };
};

/** Minimal structured-logger shape (compatible with Fastify's app.log / pino). */
export type CategorizeLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

export type CategorizeDeps = {
  complete: CompleteFn;
  categories: CategoryForPrompt[];
  chunkSize?: number;
  logger?: CategorizeLogger;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function parseBatch(text: string): AiSuggestion[] | null {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return null; }
  const parsed = AiSuggestionBatchSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export async function categorizeWithAI(txns: TxnForPrompt[], deps: CategorizeDeps): Promise<CategorizeResult> {
  const chunkSize = deps.chunkSize ?? 25;
  const log = deps.logger;
  const validCategoryIds = new Set(deps.categories.map((c) => c.id));
  const byId = new Map(txns.map((t) => [t.id, t]));

  const suggestions: AiSuggestion[] = [];
  let skipped = 0;
  const usage = { inputTokens: 0, outputTokens: 0 };

  const chunks = chunk(txns, chunkSize);
  log?.info(
    { chunks: chunks.length, txns: txns.length, chunkSize, categories: deps.categories.length },
    'categorizeWithAI: starting',
  );

  for (let ci = 0; ci < chunks.length; ci += 1) {
    const group = chunks[ci];
    const prompt = buildCategorizationPrompt(group, deps.categories);

    let batch: AiSuggestion[] | null = null;
    // Reason the last attempt failed — logged if the chunk ends up skipped.
    let lastFailure: { reason: string; detail: string } | null = null;

    for (let attempt = 0; attempt < 2 && batch === null; attempt += 1) {
      try {
        const out = await deps.complete({ prompt, jsonSchema: GEMINI_RESPONSE_SCHEMA });
        if (out.usage) { usage.inputTokens += out.usage.inputTokens; usage.outputTokens += out.usage.outputTokens; }
        batch = parseBatch(out.text);
        if (batch === null) {
          // Call succeeded but the body wasn't valid JSON / didn't match the schema.
          lastFailure = { reason: 'invalid_output', detail: out.text.slice(0, 300) };
        }
      } catch (e) {
        // Hard failures (auth / provider misconfig) must surface to the caller.
        if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'provider_not_configured')) throw e;
        // Transient (network / rate_limit) and any non-LlmError throw: treat like a
        // failed attempt — retry once, then fall through to skip the whole chunk.
        batch = null;
        lastFailure = {
          reason: e instanceof LlmError ? e.kind : 'unknown',
          detail: (e as Error)?.message ?? String(e),
        };
      }
    }

    if (batch === null) {
      skipped += group.length;
      log?.warn(
        { chunk: ci, size: group.length, reason: lastFailure?.reason, detail: lastFailure?.detail },
        'categorizeWithAI: chunk skipped after retry',
      );
      continue;
    }

    for (const s of batch) {
      const txn = byId.get(s.transactionId);
      if (!txn) continue;                          // hallucinated id
      if (!validCategoryIds.has(s.categoryId)) continue; // invented category → drop
      const kw = s.keyword.trim().toLowerCase();
      const isSubstring = kw.length >= 2 && txn.description.toLowerCase().includes(kw);
      suggestions.push({ ...s, keyword: isSubstring ? kw : '' });
    }
  }

  return { suggestions, skipped, usage };
}
