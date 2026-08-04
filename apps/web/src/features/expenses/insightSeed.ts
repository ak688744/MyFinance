import type { Insight } from '../../types';

export function buildInsightSeed(
  insight: Insight,
  txns: { id: number; description: string; amount: number }[],
): string {
  const lines = txns.map((t) => `#${t.id} "${t.description}" ₹${Math.round(t.amount)}`).join('; ');
  return [
    `I'm reviewing flagged transactions from my Expenses page because ${insight.detail}`,
    `Transactions: ${lines}.`,
    `Help me understand each and tag them appropriately (subscription, recurring, one-time, etc). Ask me about any you're unsure of, and categorize the clear ones.`,
  ].join('\n');
}
