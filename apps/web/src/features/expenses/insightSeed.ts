import type { Insight } from '../../types';

export function buildInsightSeed(
  insight: Insight,
  txns: { id: number; description: string; amount: number }[],
  userText?: string,
): string {
  const lines = txns.map((t) => `#${t.id} "${t.description}" ₹${Math.round(t.amount)}`).join('; ');
  const base = [
    `I'm reviewing flagged transactions from my Expenses page: ${insight.refinedDetail || insight.refinedTitle}`,
    `Transactions: ${lines}.`,
  ];
  if (userText && userText.trim()) {
    base.push(`Here's what I know about it: ${userText.trim()}`);
    base.push(`Use this to tag the transaction(s) appropriately (cadence: recurring/one_off/subscription/reimbursable, plus a descriptive tag for why). Confirm what you'll tag.`);
  } else {
    base.push(`Help me understand each and tag them appropriately (subscription, recurring, one-time, etc). Ask me about any you're unsure of, and tag the clear ones.`);
  }
  return base.join('\n');
}
