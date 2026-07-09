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

/**
 * Transforms the summary into stacked-bar rows: one row per day with a numeric
 * cost per model key (0 when that model had no spend that day), plus the model
 * list for stable stack ordering / colors. Feeds a stacked Recharts bar chart.
 * Example row: { day: '2026-07-02', 'gemini-2.5-flash': 0.01, 'us.anthropic…': 0.004 }
 */
export function toStackedDailyBars(
  summary: Pick<AiUsageSummaryDTO, 'byDay' | 'models'>,
): { rows: Array<Record<string, number | string>>; models: string[] } {
  const models = summary.models ?? [];
  const rows = summary.byDay.map((d) => {
    const row: Record<string, number | string> = { day: d.day };
    for (const m of models) row[m] = d.byModel[m] ?? 0;
    return row;
  });
  return { rows, models };
}
