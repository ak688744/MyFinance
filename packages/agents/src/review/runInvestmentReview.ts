import type { CompleteFn } from '../gateway';
import { LlmError } from '../llm/types';
import { InvestmentReviewSchema, REVIEW_RESPONSE_JSON_SCHEMA, type InvestmentReview } from './schema';
import { buildReviewPrompt } from './prompt';
import { checkText, collectFacts, resolvePath, type Facts } from './numberGuard';

export class ReviewFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewFailedError';
  }
}

export type ReviewOutcome = { review: InvestmentReview; dropped: { title: string; reason: string }[] };
type Problem = { index: number; title: string; reason: string }; // index -1 = summary

function parse(text: string): InvestmentReview | null {
  try {
    const r = InvestmentReviewSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

function validate(review: InvestmentReview, facts: Facts, factSheet: object): Problem[] {
  const problems: Problem[] = [];
  review.cards.forEach((c, index) => {
    const reasons: string[] = [];
    const text = checkText(`${c.title} ${c.detail}`, facts);
    if (!text.ok) reasons.push(`numbers not in the fact sheet: ${text.unsupported.join(', ')}`);
    if (c.impactInr != null && !checkText(`₹${Math.abs(c.impactInr)}`, facts).ok) reasons.push(`impactInr ${c.impactInr} is not a fact-sheet figure`);
    if (c.evidence.length === 0) reasons.push('no evidence paths');
    const missing = c.evidence.filter((p) => resolvePath(factSheet, p) === undefined);
    if (missing.length) reasons.push(`evidence paths not found: ${missing.join(', ')}`);
    if (reasons.length) problems.push({ index, title: c.title, reason: reasons.join('; ') });
  });
  const s = checkText(review.summary, facts);
  if (!s.ok) problems.push({ index: -1, title: 'summary', reason: `numbers not in the fact sheet: ${s.unsupported.join(', ')}` });
  return problems;
}

export async function runInvestmentReview(
  factSheet: object,
  deps: { complete: CompleteFn; logger?: { warn: (o: unknown, m?: string) => void } },
): Promise<ReviewOutcome> {
  const facts = collectFacts(factSheet);
  let review: InvestmentReview | null = null;
  let feedback: string[] | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text: string;
    try {
      text = (await deps.complete({ prompt: buildReviewPrompt(factSheet, feedback), jsonSchema: REVIEW_RESPONSE_JSON_SCHEMA })).text;
    } catch (e) {
      if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'provider_not_configured')) throw e;
      deps.logger?.warn({ err: (e as Error)?.message, attempt }, 'runInvestmentReview: call failed');
      continue;
    }
    const parsed = parse(text);
    if (!parsed) {
      deps.logger?.warn({ attempt, sample: text.slice(0, 200) }, 'runInvestmentReview: invalid JSON');
      continue;
    }
    review = parsed;
    const problems = validate(parsed, facts, factSheet);
    if (problems.length === 0) return { review: parsed, dropped: [] };
    feedback = problems.map((p) => `${p.title}: ${p.reason}`);
  }

  if (!review) throw new ReviewFailedError('The model did not return a valid review after two attempts.');
  const problems = validate(review, facts, factSheet);
  const badCards = new Set(problems.filter((p) => p.index >= 0).map((p) => p.index));
  return {
    review: {
      summary: problems.some((p) => p.index === -1) ? '' : review.summary,
      cards: review.cards.filter((_, i) => !badCards.has(i)),
    },
    dropped: problems.filter((p) => p.index >= 0).map(({ title, reason }) => ({ title, reason })),
  };
}
