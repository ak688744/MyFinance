import { LlmError, type LlmUsage } from '../llm/types';
import { TriageResponseSchema, TRIAGE_RESPONSE_JSON_SCHEMA, CADENCE_VOCAB, type TriageVerdict } from './schema';
import {
  buildTriageSystemPrompt, buildTriageUserPrompt, DEFAULT_KNOWN_CATEGORIES, type TriageEventInput,
} from './prompt';

const CADENCE_TAG_SET = new Set<string>(CADENCE_VOCAB);

/**
 * DETERMINISTIC BACKSTOP: an event whose transactions already carry a cadence tag is
 * ALWAYS suppressed, no matter what the LLM decided. A cadence tag means a human
 * already resolved this event (e.g. answered "it's rent" once) — re-asking on every
 * re-triage (say, after a description/category contradiction the model notices again)
 * would nag the user about something already settled. The prompt also instructs this
 * priority, but completeness is a DATA fact, not a per-call model judgment call, so we
 * enforce it in code — this can never regress on model whim.
 */
function alreadyHasCadenceTag(e: TriageEventInput): boolean {
  return e.transactions.some((t) => t.tags.some((tag) => CADENCE_TAG_SET.has(tag)));
}

function forceSuppress(v: TriagedInsight): TriagedInsight {
  return {
    ...v,
    tier: 'suppress',
    keep: false,
    lane: null,
    question: null,
    options: [],
    reason: 'Already tagged with a cadence — resolved previously; not re-asking.',
  };
}

export type { TriageEventInput } from './prompt';
export type { TriageVerdict } from './schema';

export type CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>;

/** A verdict enriched with the event's stable signature (for per-event caching). */
export type TriagedInsight = TriageVerdict & { signature: string };

export type TriageResult = {
  verdicts: TriagedInsight[];
  usage: { inputTokens: number; outputTokens: number };
};

export type TriageDeps = {
  complete: CompleteFn;
  knownCategories?: string[];
  logger?: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void };
};

function parseResponse(text: string): TriageVerdict[] | null {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return null; }
  const parsed = TriageResponseSchema.safeParse(json);
  return parsed.success ? parsed.data.verdicts : null;
}

// When the model can't be trusted for an event (dropped, hallucinated, or the whole
// batch failed to parse), we DO NOT lose the event: we keep it as a needs_input card
// so the work-queue never silently drops a transaction that needs attention.
function fallbackVerdict(e: TriageEventInput): TriagedInsight {
  const primary = e.flaggedBy[0];
  return {
    eventId: e.eventId,
    signature: e.signature,
    tier: 'needs_input',
    keep: true,
    lane: 'needs_input',
    refinedTitle: primary?.title ?? 'Needs review',
    refinedDetail: primary?.detail ?? 'This transaction needs clarification.',
    question: 'Can you tell us more about this spend — is it recurring or a one-off?',
    options: [
      { label: 'Recurring', tags: ['recurring'], categoryFix: null },
      { label: 'One-off', tags: ['one_off'], categoryFix: null },
      { label: 'A reimbursable expense', tags: ['reimbursable'], categoryFix: null },
    ],
    reason: 'Not confidently triaged by the model; surfaced for your review.',
  };
}

export async function triageInsights(events: TriageEventInput[], deps: TriageDeps): Promise<TriageResult> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  if (events.length === 0) return { verdicts: [], usage };

  const knownCategories = deps.knownCategories ?? DEFAULT_KNOWN_CATEGORIES;
  const system = buildTriageSystemPrompt();
  const user = buildTriageUserPrompt(events, knownCategories);
  const prompt = `${system}\n\n${user}`;

  let verdicts: TriageVerdict[] | null = null;
  let lastFailure: { reason: string; detail: string } | null = null;

  for (let attempt = 0; attempt < 2 && verdicts === null; attempt += 1) {
    try {
      const out = await deps.complete({ prompt, jsonSchema: TRIAGE_RESPONSE_JSON_SCHEMA });
      if (out.usage) { usage.inputTokens += out.usage.inputTokens; usage.outputTokens += out.usage.outputTokens; }
      verdicts = parseResponse(out.text);
      if (verdicts === null) lastFailure = { reason: 'invalid_output', detail: out.text.slice(0, 300) };
    } catch (e) {
      // Hard failures (auth / provider misconfig) must surface to the caller.
      if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'provider_not_configured')) throw e;
      verdicts = null;
      lastFailure = { reason: e instanceof LlmError ? e.kind : 'unknown', detail: (e as Error)?.message ?? String(e) };
    }
  }

  const byEventId = new Map(events.map((e) => [e.eventId, e]));

  const withBackstop = (v: TriagedInsight, e: TriageEventInput): TriagedInsight =>
    alreadyHasCadenceTag(e) ? forceSuppress(v) : v;

  if (verdicts === null) {
    // Whole batch failed after retry: fall back to keeping every event as needs_input
    // (unless the deterministic backstop already suppresses it).
    deps.logger?.warn({ reason: lastFailure?.reason, detail: lastFailure?.detail, events: events.length }, 'triageInsights: batch failed, using fallback');
    return { verdicts: events.map((e) => withBackstop(fallbackVerdict(e), e)), usage };
  }

  // Attach signatures; drop hallucinated eventIds.
  const out: TriagedInsight[] = [];
  const judged = new Set<string>();
  for (const v of verdicts) {
    const e = byEventId.get(v.eventId);
    if (!e) continue; // hallucinated event id → drop
    judged.add(v.eventId);
    out.push(withBackstop({ ...v, signature: e.signature }, e));
  }
  // Any event the model didn't judge → fallback so it isn't silently lost.
  for (const e of events) if (!judged.has(e.eventId)) out.push(withBackstop(fallbackVerdict(e), e));

  return { verdicts: out, usage };
}
