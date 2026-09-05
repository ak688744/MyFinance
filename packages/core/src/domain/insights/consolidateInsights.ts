// Semantic consolidation of deterministic insight candidates into "events".
//
// The rules (expenseInsights.ts) have high recall but produce OVERLAPPING candidates:
// on real data one car purchase can trip needs_clarity + several new_spend + an
// abnormal_spend card, all pointing at the same transactions. If we naively merged
// every candidate that shares a transaction (transitive union-find), the broad
// detectors (needs_clarity, abnormal_spend) would act as connective tissue and
// collapse unrelated events into one giant card — the opposite failure mode.
//
// So consolidation is SEMANTIC, not set-overlap:
//   • new_spend candidates are merged with each other BY MERCHANT/STORY (they are
//     the "novelty" signal and genuinely describe the same merchant when keys match);
//   • needs_clarity and abnormal_spend each stay their OWN event — they never pull
//     other candidates in.
// A single transaction can therefore appear in several events (e.g. both the
// merchant's new_spend event and the month's needs_clarity event); that is correct —
// they are different lenses on it, and the LLM triage dedupes the framing.
//
// Each event carries a stable `signature` = a hash of its grouped transaction ids +
// each transaction's current category and tags. Answering a question writes a tag or
// fixes a category → that event's signature changes → its cached triage is stale and
// recomputes, while every untouched event's signature is unchanged so its cached
// verdict is reused verbatim (per-event self-heal, no reshuffle of stable cards).

import type { Insight, InsightType } from './expenseInsights';

export type ConsolidationTxn = {
  id: number;
  description: string;
  amount: number;
  categoryId: string | null;
  tags: { tag: string }[];
};

export type RuleSignal = { type: InsightType; title: string; detail: string; severity: 'info' | 'warn' };

export type InsightEvent = {
  eventId: string;
  ruleSignals: RuleSignal[];
  txnIds: number[];
  /** Stable content hash: grouped txn ids + each txn's category + sorted tags. */
  signature: string;
};

// Must mirror expenseInsights.merchantKeyOf exactly: drop volatile per-txn
// reference numbers (>=6-digit tokens) so recurring UPI/ACH payments produce a
// stable key (and thus a stable eventId) across months instead of re-surfacing
// as new spend and defeating the per-event triage cache every month.
const merchantKeyOf = (d: string, derive: (s: string) => string | null): string =>
  (derive(d) ?? d)
    .split(/[^A-Za-z0-9]+/)
    .filter((tok) => tok.length > 0 && !/^\d{6,}$/.test(tok))
    .join('')
    .toUpperCase();

// FNV-1a 32-bit: tiny, dependency-free, deterministic. Sufficient as a cache key
// (not used for anything security-sensitive).
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function signatureFor(txnIds: number[], txById: Map<number, ConsolidationTxn>): string {
  // Order-independent: sort ids, and sort each txn's tags, before hashing.
  const parts = [...txnIds].sort((a, b) => a - b).map((id) => {
    const t = txById.get(id);
    if (!t) return `${id}:MISSING`;
    const tags = t.tags.map((x) => x.tag).sort().join('|');
    return `${id}:${t.categoryId ?? 'null'}:[${tags}]`;
  });
  return hashString(parts.join(';'));
}

const toSignal = (c: Insight): RuleSignal => ({ type: c.type, title: c.title, detail: c.detail, severity: c.severity });

export function consolidateInsights(
  candidates: Insight[],
  txns: ConsolidationTxn[],
  deriveMerchantName: (description: string) => string | null,
): InsightEvent[] {
  const txById = new Map(txns.map((t) => [t.id, t]));
  const events: { eventId: string; ruleSignals: RuleSignal[]; txnIds: number[] }[] = [];

  // 1) new_spend: merge by merchant key. Group its candidates keyed on the merchant
  //    of their (first) transaction — same merchant string → one story.
  const newSpendByMerchant = new Map<string, { eventId: string; ruleSignals: RuleSignal[]; txnIds: number[] }>();
  for (const c of candidates) {
    if (c.type !== 'new_spend') continue;
    const firstTxn = txById.get(c.transactionIds[0]);
    const key = firstTxn ? merchantKeyOf(firstTxn.description, deriveMerchantName) : c.id;
    const g = newSpendByMerchant.get(key) ?? { eventId: `event:new_spend:${key}`, ruleSignals: [], txnIds: [] };
    g.ruleSignals.push(toSignal(c));
    for (const id of c.transactionIds) if (!g.txnIds.includes(id)) g.txnIds.push(id);
    newSpendByMerchant.set(key, g);
  }
  events.push(...newSpendByMerchant.values());

  // 2) needs_clarity and abnormal_spend: each candidate is its OWN event. They never
  //    connect to other events.
  for (const c of candidates) {
    if (c.type === 'new_spend') continue;
    events.push({ eventId: `event:${c.id}`, ruleSignals: [toSignal(c)], txnIds: [...c.transactionIds] });
  }

  return events.map((e) => ({ ...e, signature: signatureFor(e.txnIds, txById) }));
}
