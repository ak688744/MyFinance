import { LlmError, type LlmUsage } from '../llm/types';
import { CcStatementParseSchema, CC_STATEMENT_RESPONSE_SCHEMA, type CcStatementParse } from './schema';
import { buildCcStatementPrompt } from './prompt';

export type CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>;

function parse(text: string): CcStatementParse | null {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return null; }
  const r = CcStatementParseSchema.safeParse(json);
  return r.success ? r.data : null;
}

export async function parseCcStatement(complete: CompleteFn, statementText: string): Promise<CcStatementParse> {
  const prompt = buildCcStatementPrompt(statementText);
  let out: CcStatementParse | null = null;
  for (let attempt = 0; attempt < 2 && out === null; attempt += 1) {
    try {
      const res = await complete({ prompt, jsonSchema: CC_STATEMENT_RESPONSE_SCHEMA });
      out = parse(res.text);
    } catch (e) {
      if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'provider_not_configured')) throw e;
      out = null; // transient / unknown → retry once
    }
  }
  if (out === null) throw new Error('cc_parse_failed');
  return out;
}
