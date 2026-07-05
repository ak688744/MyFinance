import { useState, useMemo } from 'react';
import { useExpenses, useExpenseSummary, useCategories, useAccounts, useAiSuggest } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { DonutChart, SpendBarChart } from '../../components/ui/charts';
import {
  formatINR, formatDate, currentMonth, addMonths, monthBounds, formatMonthLong, monthWindow,
} from '../../lib/format';
import { summaryByCategoryWithNames } from '../../lib/transforms';
import { CategoryChip } from './CategoryChip';
import { ManageCategoriesModal } from './ManageCategoriesModal';
import { ImportModal } from '../imports/ImportModal';

const PAGE_SIZE = 25;

export function ExpensesPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [categoryFilter, setCategoryFilter] = useState<string>(''); // '' = all
  const [page, setPage] = useState(0);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aiKeywordById, setAiKeywordById] = useState<Record<number, string>>({});
  const [aiBanner, setAiBanner] = useState<null | { suggested: number; skipped: number; total: number; usage: { inputTokens: number; outputTokens: number }; warnings: string[] }>(null);

  const bounds = monthBounds(month);
  const categories = useCategories();
  const accounts = useAccounts('expense');
  const aiSuggest = useAiSuggest();

  // Month-scoped summary drives KPIs + donut.
  const summary = useExpenseSummary({ from: bounds.from, to: bounds.to });
  // All-time summary drives the month-on-month chart (a single month is 1 bar).
  const allTimeSummary = useExpenseSummary({});

  // Transaction table: month-scoped, category-filtered, paginated.
  // AI-suggested filter bypasses server-side categoryId filter; apply client-side instead.
  const txns = useExpenses({
    from: bounds.from,
    to: bounds.to,
    ...(categoryFilter && categoryFilter !== '__ai__' ? { categoryId: categoryFilter } : {}),
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  });

  const accountLabel = useMemo(() => {
    const m = new Map((accounts.data ?? []).map((a) => [a.id, `${a.institution} · ${a.label}`]));
    return (id: number | null) => (id != null ? m.get(id) ?? `#${id}` : '—');
  }, [accounts.data]);

  const runAiSuggest = async () => {
    try {
      const res = await aiSuggest.mutateAsync({ from: bounds.from, to: bounds.to });
      const map: Record<number, string> = {};
      for (const s of res.suggestions) {
        map[s.transactionId] = s.keyword;
      }
      setAiKeywordById(map);
      setAiBanner({
        suggested: res.counts.suggested,
        skipped: res.counts.skipped,
        total: res.counts.total,
        usage: res.usage,
        warnings: res.warnings,
      });
    } catch (err) {
      console.error('AI suggest failed:', err);
    }
  };

  const uncategorizedInMonthCount = (txns.data ?? []).filter((t) => t.categoryId == null).length;

  const byCategory = summary.data
    ? summaryByCategoryWithNames(summary.data.byCategory, categories.data ?? [])
    : [];

  // Window the all-time byMonth series to 3-before / selected / 3-after.
  const chartMonths = useMemo(() => {
    const all = (allTimeSummary.data?.byMonth ?? []).map((m) => m.month);
    const window = new Set(monthWindow(all, month));
    const spentByMonth = new Map((allTimeSummary.data?.byMonth ?? []).map((m) => [m.month, m.spent]));
    return [...window].sort().map((mo) => ({ month: mo, spent: spentByMonth.get(mo) ?? 0 }));
  }, [allTimeSummary.data, month]);

  const invested = summary.data?.invested ?? 0;
  const saved = summary.data?.saved ?? 0;
  const cashRemaining = saved - invested;
  const savingsRate = summary.data && summary.data.totalIncome > 0
    ? (saved / summary.data.totalIncome) * 100
    : null;

  const goMonth = (delta: number) => { setMonth((m) => addMonths(m, delta)); setPage(0); };
  const isCurrent = month >= currentMonth();

  // Client-side filter for AI-suggested transactions when that filter is active.
  const displayedRows = useMemo(() => {
    if (categoryFilter !== '__ai__') return txns.data ?? [];
    return (txns.data ?? []).filter((t) => t.categorySource === 'ai_suggested');
  }, [txns.data, categoryFilter]);

  const rowCount = displayedRows.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header: month selector + actions */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => goMonth(-1)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-600"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="min-w-[150px] text-center font-heading text-lg">{formatMonthLong(month)}</div>
          <button
            onClick={() => goMonth(1)}
            disabled={isCurrent}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next month"
          >
            ›
          </button>
          {!isCurrent && (
            <button onClick={() => { setMonth(currentMonth()); setPage(0); }} className="ml-2 text-xs text-brand hover:underline">
              This month
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runAiSuggest}
            disabled={aiSuggest.isPending || uncategorizedInMonthCount === 0}
            className="text-sm bg-violet-600 text-white rounded-lg px-4 py-2 hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {aiSuggest.isPending ? 'Suggesting…' : `Suggest categories with AI · ${formatMonthLong(month)}`}
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="text-sm border border-brand text-brand rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors"
          >
            + Import expenses
          </button>
          <button
            onClick={() => setManageModalOpen(true)}
            className="text-sm bg-white border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
          >
            Manage categories & rules
          </button>
        </div>
      </div>

      <ManageCategoriesModal open={manageModalOpen} onClose={() => setManageModalOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      {/* AI Suggestion Banner */}
      {aiBanner && (
        <Card className="bg-violet-50 border-violet-200">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <div className="text-sm font-semibold text-violet-900 mb-1">
                AI suggested categories for {aiBanner.suggested} of {aiBanner.total} transaction(s)
              </div>
              <div className="text-xs text-violet-700 space-y-0.5">
                <div>Skipped: {aiBanner.skipped}</div>
                {aiBanner.usage.inputTokens + aiBanner.usage.outputTokens > 0 && (
                  <div>~{aiBanner.usage.inputTokens + aiBanner.usage.outputTokens} tokens</div>
                )}
              </div>
              {aiBanner.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  {aiBanner.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{w}</div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setAiBanner(null)}
              className="text-xs text-violet-600 hover:text-violet-800 underline"
            >
              Dismiss
            </button>
          </div>
        </Card>
      )}

      {/* KPI strip: Spent / Income / Saved(=Invested+Cash) */}
      <DataState isLoading={summary.isLoading} error={summary.error} onRetry={summary.refetch}>
        {summary.data && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPIStat label="Total Spent" value={formatINR(summary.data.totalSpent)} />
            <KPIStat label="Income" value={formatINR(summary.data.totalIncome)} />
            <Card>
              <div className="flex justify-between items-start">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Saved</div>
                {savingsRate !== null && <div className="text-xs text-gray-400 tabular">{savingsRate.toFixed(1)}% rate</div>}
              </div>
              <div className={`font-heading text-2xl mt-1 tabular ${saved >= 0 ? 'text-gain' : 'text-loss'}`}>{formatINR(saved)}</div>
              <div className="flex gap-4 mt-2 text-xs">
                <div>
                  <div className="text-gray-400">Invested</div>
                  <div className="tabular text-gray-700">{formatINR(invested)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Cash remaining</div>
                  <div className="tabular text-gray-700">{formatINR(cashRemaining)}</div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </DataState>

      <AIInsightCard text="Spending insights and category trends will be analysed by the assistant in L4." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="text-sm font-semibold mb-3">Spending Breakdown · {formatMonthLong(month)}</div>
          <DonutChart data={byCategory.map((c) => ({ name: c.name, value: c.amount }))} />
        </Card>
        <Card>
          <div className="text-sm font-semibold mb-3">Month-on-month Spend</div>
          <SpendBarChart data={chartMonths} />
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <div className="text-sm font-semibold">Transactions · {formatMonthLong(month)}</div>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All categories</option>
            <option value="__ai__">AI suggested</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <DataState isLoading={txns.isLoading} error={txns.error} isEmpty={rowCount === 0 && page === 0} emptyMessage="No transactions this month." onRetry={txns.refetch}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-gray-400 text-left">
                <th className="font-medium py-2">Merchant</th>
                <th className="font-medium py-2">Category</th>
                <th className="font-medium py-2">Account</th>
                <th className="font-medium py-2 text-right">Date</th>
                <th className="font-medium py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((t) => (
                <tr key={t.id} className="border-t border-gray-50">
                  <td className="py-2.5 pr-3 max-w-[280px] truncate">{t.description}</td>
                  <td className="py-2.5 pr-3">
                    <CategoryChip txId={t.id} categoryId={t.categoryId} categorySource={t.categorySource} aiKeyword={aiKeywordById[t.id]} merchantLabel={t.description} categories={categories.data ?? []} />
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{accountLabel(t.accountId)}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-400 text-xs whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                  <td className={`py-2.5 text-right tabular ${t.direction === 'credit' ? 'text-gain' : ''}`}>
                    {t.direction === 'credit' ? '+' : '-'}{formatINR(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination: offset-based. We show a Next only when a full page came back. */}
          <div className="flex justify-between items-center mt-3 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹ Prev
            </button>
            <span className="text-gray-400 text-xs">Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={rowCount < PAGE_SIZE}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next ›
            </button>
          </div>
        </DataState>
      </Card>
    </div>
  );
}
