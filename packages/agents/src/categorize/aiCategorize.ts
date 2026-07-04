import type { LlmProvider } from '../llm/types';
import {
  AiSuggestionBatchSchema, GEMINI_RESPONSE_SCHEMA, type AiSuggestion,
} from './schema';
import { buildCategorizationPrompt, type TxnForPrompt, type CategoryForPrompt } from './prompt';

export type CategorizeResult = {
  suggestions: AiSuggestion[];
  skipped: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type CategorizeDeps = {
  provider: LlmProvider;
  categories: CategoryForPrompt[];
  chunkSize?: number;
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
  const validCategoryIds = new Set(deps.categories.map((c) => c.id));
  const byId = new Map(txns.map((t) => [t.id, t]));

  const suggestions: AiSuggestion[] = [];
  let skipped = 0;
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (const group of chunk(txns, chunkSize)) {
    const prompt = buildCategorizationPrompt(group, deps.categories);

    let batch: AiSuggestion[] | null = null;
    for (let attempt = 0; attempt < 2 && batch === null; attempt += 1) {
      const out = await deps.provider.complete({ prompt, jsonSchema: GEMINI_RESPONSE_SCHEMA });
      if (out.usage) { usage.inputTokens += out.usage.inputTokens; usage.outputTokens += out.usage.outputTokens; }
      batch = parseBatch(out.text);
    }

    if (batch === null) { skipped += group.length; continue; }

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
