// Assembles the full insights pipeline for a month:
//   rule candidates (core, deterministic) → semantic consolidation (core) →
//   per-event LLM triage (agents, cached by signature) → triaged cards.
//
// Caching is PER-EVENT by signature: a plain refresh reuses every cached verdict
// (no LLM call, no reshuffle); answering a question mutates a txn → that event's
// signature changes → only that event re-triages, others are served verbatim.

import {
  computeExpenseInsights, consolidateInsights, LOOKBACK_MONTHS,
  type InsightEvent,
} from '@myfinance/core';
import { triageInsights, applyCadenceBackstop, type TriageEventInput, type TriagedInsight } from '@myfinance/agents';
import type { Repos } from '../plugins/db';
import type { Gateway } from '../plugins/gateway';
import { deriveMerchantName } from './deriveMerchantName';

export type TriagedCard = TriagedInsight & { txnIds: number[] };

type Logger = { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void; error?: (o: unknown, m?: string) => void };

/** Build the deterministic events for a month (candidates → consolidation). */
export function buildMonthEvents(repos: Repos, month: string): { events: InsightEvent[]; txnById: Map<number, { id: number; description: string; amount: number; categoryId: string | null; tags: { tag: string }[]; direction: 'debit' | 'credit' }> } {
  const [y, m] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const priorStartDate = new Date(Date.UTC(y, m - 1 - LOOKBACK_MONTHS, 1));
  const priorStart = `${priorStartDate.getUTCFullYear()}-${String(priorStartDate.getUTCMonth() + 1).padStart(2, '0')}-01`;

  const monthTxns = repos.expenseTxRepo.query({ from: monthStart, to: monthEnd });
  const priorTxns = repos.expenseTxRepo.query({ from: priorStart, to: monthStart }).filter((t) => t.transactionDate < monthStart);
  const thisMonthSummary = repos.expenseTxRepo.summary({ from: monthStart, to: monthEnd });

  const byCategoryPriorMonths: { month: string; categoryId: string | null; amount: number }[] = [];
  for (let k = 1; k <= LOOKBACK_MONTHS; k += 1) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    const mm = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const s = repos.expenseTxRepo.summary({ from: `${mm}-01`, to: `${mm}-31` });
    for (const c of s.byCategory) byCategoryPriorMonths.push({ month: mm, categoryId: c.categoryId, amount: c.amount });
  }

  const toInsightTxn = (t: (typeof monthTxns)[number]) => ({
    id: t.id, transactionDate: t.transactionDate, description: t.description, amount: t.amount,
    direction: t.direction, categoryId: t.categoryId, tags: t.tags,
  });

  const candidates = computeExpenseInsights({
    month,
    monthTxns: monthTxns.map(toInsightTxn),
    priorTxns: priorTxns.map(toInsightTxn),
    byCategoryThisMonth: thisMonthSummary.byCategory,
    byCategoryPriorMonths,
    deriveMerchantName,
  });

  const consolidationTxns = monthTxns.map((t) => ({
    id: t.id, description: t.description, amount: t.amount, categoryId: t.categoryId, tags: t.tags,
    direction: t.direction,
  }));
  const events = consolidateInsights(candidates, consolidationTxns, deriveMerchantName);
  const txnById = new Map(consolidationTxns.map((t) => [t.id, t]));
  return { events, txnById };
}

type TxnById = Map<number, { id: number; description: string; amount: number; categoryId: string | null; tags: { tag: string }[]; direction: 'debit' | 'credit' }>;

function toTriageEventInput(e: InsightEvent, txnById: TxnById): TriageEventInput {
  return {
    eventId: e.eventId,
    signature: e.signature,
    flaggedBy: e.ruleSignals.map((s) => ({ type: s.type, title: s.title, detail: s.detail })),
    transactions: e.txnIds.map((id) => {
      const t = txnById.get(id);
      return {
        id, amount: t ? Math.round(t.amount) : 0, category: t?.categoryId ?? null,
        tags: (t?.tags ?? []).map((x) => x.tag), merchant: t ? deriveMerchantName(t.description) : null,
        raw: t?.description ?? '', direction: t?.direction,
      };
    }),
  };
}

/**
 * Returns triaged cards for a month. Serves cached verdicts for events whose
 * signature is unchanged; triages only new/stale events (one gateway call), then
 * persists them. When `gateway` is absent or triage fails, returns the cached ones
 * plus raw (untriaged→fallback-shaped) cards so the page still renders.
 *
 * A cached verdict is re-checked against the deterministic cadence backstop on EVERY
 * read (not just at triage time) — this heals a stale/wrong cache row (e.g. one written
 * before the transaction was tagged, or a fallback verdict cached from a transient LLM
 * failure) with no LLM call. Only CONFIDENT verdicts (genuinely judged by the model, or
 * backstop-forced) are persisted back to the cache; an unconfident fallback is served
 * for this load but left uncached so the next load retries triage instead of freezing
 * a wrong "needs input" card forever.
 */
export async function getTriagedInsights(
  repos: Repos,
  gateway: Gateway | undefined,
  month: string,
  logger?: Logger,
): Promise<TriagedCard[]> {
  const { events, txnById } = buildMonthEvents(repos, month);
  if (events.length === 0) return [];

  // 1) Cache lookup by signature, healed against the current cadence-tag data. If
  // healing actually changed the verdict (a stale/wrong row gets backstop-suppressed),
  // persist the healed version so the row itself stops being wrong, not just this read.
  const cached = repos.expenseInsightTriageRepo.getMany(events.map((e) => e.signature));
  const cachedBySig = new Map(cached.map((r) => [r.signature, JSON.parse(r.verdictJson) as TriagedInsight]));
  const eventsBySig = new Map(events.map((e) => [e.signature, e]));
  const healedBySig = new Map<string, TriagedInsight>();
  for (const [sig, verdict] of cachedBySig) {
    const e = eventsBySig.get(sig);
    const healed = e ? applyCadenceBackstop(verdict, toTriageEventInput(e, txnById)) : verdict;
    healedBySig.set(sig, healed);
    if (healed !== verdict) {
      repos.expenseInsightTriageRepo.upsert({ signature: sig, month, verdictJson: JSON.stringify(healed) });
    }
  }

  const stale = events.filter((e) => !healedBySig.has(e.signature));

  // 2) Triage stale events (only if we have a gateway).
  let freshBySig = new Map<string, TriagedInsight>();
  if (stale.length > 0 && gateway) {
    const knownCategories = repos.categoryRepo.list().map((c) => c.id);
    const triageInput: TriageEventInput[] = stale.map((e) => toTriageEventInput(e, txnById));

    try {
      const result = await gateway.runTask('expense_insight_triage', (complete) =>
        triageInsights(triageInput, { complete, knownCategories, logger }));
      freshBySig = new Map(result.verdicts.map((v) => [v.signature, v]));
      // Persist only CONFIDENT verdicts — an unconfident fallback must not freeze.
      for (const v of result.verdicts) {
        if (!v.confident) continue;
        repos.expenseInsightTriageRepo.upsert({ signature: v.signature, month, verdictJson: JSON.stringify(v) });
      }
    } catch (e) {
      logger?.warn?.({ err: (e as Error)?.message }, 'insightsService: triage failed; serving cached + untriaged');
    }
  }

  // 3) Assemble cards in event order; drop suppressed; attach txnIds.
  const cards: TriagedCard[] = [];
  for (const e of events) {
    const verdict = freshBySig.get(e.signature) ?? healedBySig.get(e.signature);
    if (!verdict) {
      // Triage unavailable (no AI configured, or it failed) → surface the raw rule
      // flag as an untriaged needs_input card so the page still shows the work-queue.
      cards.push(untriagedCard(e));
      continue;
    }
    if (verdict.tier === 'suppress' || !verdict.keep) continue;
    cards.push({ ...verdict, txnIds: e.txnIds });
  }
  return cards;
}

/** A raw (un-triaged) card built directly from a rule event — shown when the LLM
 *  triage can't run so the deterministic work-queue is never fully hidden. */
function untriagedCard(e: InsightEvent): TriagedCard {
  const primary = e.ruleSignals[0];
  return {
    eventId: e.eventId,
    signature: e.signature,
    tier: 'needs_input',
    keep: true,
    lane: 'needs_input',
    refinedTitle: primary?.title ?? 'Needs review',
    refinedDetail: primary?.detail ?? '',
    question: 'Is this recurring or a one-off?',
    options: [
      { label: 'Recurring', tags: ['recurring'], categoryFix: null },
      { label: 'One-off', tags: ['one_off'], categoryFix: null },
    ],
    reason: 'AI triage not available; showing the raw rule flag.',
    confident: false,
    txnIds: e.txnIds,
  };
}
