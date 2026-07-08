import type { AiUsageSummaryDTO } from './types';

/**
 * Formats USD cost with smart precision: >= 0.01 shows 2 decimals, < 0.01 shows 4 decimals.
 * Examples: 1.5 → "$1.50", 0.0031 → "$0.0031", 0 → "$0.00"
 */
export function formatUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

/**
 * Transforms the byDay summary array into bar chart data format.
 */
export function toDailyBars(summary: Pick<AiUsageSummaryDTO, 'byDay'>): { label: string; value: number }[] {
  return summary.byDay.map((d) => ({ label: d.day, value: d.costUsd }));
}
