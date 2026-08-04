import { useState, useMemo } from 'react';
import { useExpenses, useExpenseSummary, useCategories, useAccounts, useAiSuggest, useUpdateTransaction, useDeleteTransaction, useCreateTransaction, useSetTxTags, useRemoveTxTag } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { DonutChart, SpendBarChart } from '../../components/ui/charts';
import {
  formatINR, formatDate, currentMonth, addMonths, monthBounds, formatMonthLong, monthWindow,
  deriveMerchantName,
} from '../../lib/format';
import { summaryByCategoryWithNames } from '../../lib/transforms';
import { CategoryChip } from './CategoryChip';
import { TagChips } from './TagChips';
import { ManageCategoriesModal } from './ManageCategoriesModal';
import { ImportModal } from '../imports/ImportModal';
import { Modal } from '../../components/ui/Modal';
import type { ExpenseRow } from '../../types';

const PAGE_SIZE = 25;

type DirectionFilter = '' | 'debit' | 'credit' | 'transfer';

export function ExpensesPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(0);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addTxOpen, setAddTxOpen] = useState(false);
  const [aiKeywordById, setAiKeywordById] = useState<Record<number, string>>({});
  const [aiBanner, setAiBanner] = useState<null | { suggested: number; skipped: number; total: number; usage: { inputTokens: number; outputTokens: number }; warnings: string[] }>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const bounds = monthBounds(month);
  const categories = useCategories();
  const accounts = useAccounts('expense');
  const aiSuggest = useAiSuggest();

  const summary = useExpenseSummary({ from: bounds.from, to: bounds.to });
  const allTimeSummary = useExpenseSummary({});

  // Build query params — multi-category not supported server-side, so if multiple categories selected, fetch all and filter client-side.
  const serverCategoryId = categoryFilters.length === 1 && categoryFilters[0] !== '__ai__' ? categoryFilters[0] : undefined;
  const txns = useExpenses({
    from: bounds.from,
    to: bounds.to,
    ...(directionFilter === 'debit' || directionFilter === 'credit' ? { direction: directionFilter === 'debit' ? 'out' : 'in' } : {}),
    ...(searchText ? { search: searchText } : {}),
    ...(serverCategoryId ? { categoryId: serverCategoryId } : {}),
    limit: categoryFilters.length > 1 || categoryFilters.includes('__ai__') ? '500' : String(PAGE_SIZE),
    offset: categoryFilters.length > 1 || categoryFilters.includes('__ai__') ? '0' : String(page * PAGE_SIZE),
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

  const goMonth = (delta: number) => { setMonth((m) => addMonths(m, delta)); setPage(0); setAiBanner(null); setAiKeywordById({}); };
  const isCurrent = month >= currentMonth();

  // Client-side filtering for multi-category and AI-suggested
  const displayedRows = useMemo(() => {
    let rows = txns.data ?? [];
    if (categoryFilters.includes('__ai__')) {
      rows = rows.filter((t) => t.categorySource === 'ai_suggested');
    } else if (categoryFilters.length > 1) {
      const set = new Set(categoryFilters);
      rows = rows.filter((t) => (t.categoryId && set.has(t.categoryId)) || (set.has('__uncategorized__') && !t.categoryId));
    }
    if (directionFilter === 'transfer') {
      rows = rows.filter((t) => {
        const catName = t.categoryId ? (categories.data ?? []).find(c => c.id === t.categoryId)?.name?.toLowerCase() : '';
        return catName === 'transfer' || catName === 'self_transfer';
      });
    }
    // Paginate client-side when using multi-filter
    if (categoryFilters.length > 1 || categoryFilters.includes('__ai__')) {
      return rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    }
    return rows;
  }, [txns.data, categoryFilters, directionFilter, categories.data, page]);

  // Total for all filtered rows (not just current page)
  const filteredTotal = useMemo(() => {
    let rows = txns.data ?? [];
    if (categoryFilters.includes('__ai__')) {
      rows = rows.filter((t) => t.categorySource === 'ai_suggested');
    } else if (categoryFilters.length > 1) {
      const set = new Set(categoryFilters);
      rows = rows.filter((t) => (t.categoryId && set.has(t.categoryId)) || (set.has('__uncategorized__') && !t.categoryId));
    }
    if (directionFilter === 'transfer') {
      rows = rows.filter((t) => {
        const catName = t.categoryId ? (categories.data ?? []).find(c => c.id === t.categoryId)?.name?.toLowerCase() : '';
        return catName === 'transfer' || catName === 'self_transfer';
      });
    }
    return rows.reduce((sum, t) => sum + (t.direction === 'credit' ? t.amount : -t.amount), 0);
  }, [txns.data, categoryFilters, directionFilter, categories.data]);

  const totalRowCount = useMemo(() => {
    let rows = txns.data ?? [];
    if (categoryFilters.includes('__ai__')) {
      rows = rows.filter((t) => t.categorySource === 'ai_suggested');
    } else if (categoryFilters.length > 1) {
      const set = new Set(categoryFilters);
      rows = rows.filter((t) => (t.categoryId && set.has(t.categoryId)) || (set.has('__uncategorized__') && !t.categoryId));
    }
    return rows.length;
  }, [txns.data, categoryFilters]);

  const rowCount = displayedRows.length;

  const resetFilters = () => { setCategoryFilters([]); setDirectionFilter(''); setSearchText(''); setPage(0); };

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
          <button
            onClick={() => setMonthPickerOpen(!monthPickerOpen)}
            className="min-w-[150px] text-center font-heading text-lg hover:text-brand transition-colors cursor-pointer"
            title="Click to pick a month"
          >
            {formatMonthLong(month)}
          </button>
          <button
            onClick={() => goMonth(1)}
            disabled={isCurrent}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next month"
          >
            ›
          </button>
          {!isCurrent && (
            <button onClick={() => { setMonth(currentMonth()); setPage(0); setAiBanner(null); setAiKeywordById({}); }} className="ml-2 text-xs text-brand hover:underline">
              This month
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <button
              onClick={runAiSuggest}
              disabled={aiSuggest.isPending || uncategorizedInMonthCount === 0}
              className="text-sm bg-violet-600 text-white rounded-lg px-4 py-2 hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiSuggest.isPending ? 'Suggesting…' : `Suggest with AI`}
            </button>
            {aiSuggest.error && (
              <div className="text-xs text-loss mt-1 max-w-[240px]">{(aiSuggest.error as Error).message}</div>
            )}
          </div>
          <button
            onClick={() => setAddTxOpen(true)}
            className="text-sm bg-brand text-white rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            + Add transaction
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="text-sm border border-brand text-brand rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors"
          >
            Import
          </button>
          <button
            onClick={() => setManageModalOpen(true)}
            className="text-sm bg-white border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
          >
            Categories & rules
          </button>
        </div>
      </div>

      {/* Month picker dropdown */}
      {monthPickerOpen && (
        <MonthPicker
          current={month}
          onSelect={(m) => { setMonth(m); setPage(0); setAiBanner(null); setAiKeywordById({}); setMonthPickerOpen(false); }}
          onClose={() => setMonthPickerOpen(false)}
        />
      )}

      <ManageCategoriesModal open={manageModalOpen} onClose={() => setManageModalOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <AddTransactionModal open={addTxOpen} onClose={() => setAddTxOpen(false)} categories={categories.data ?? []} />

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

      {/* KPI strip */}
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

      {/* Filters bar */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="text-sm font-semibold mr-2">Transactions · {formatMonthLong(month)}</div>

          {/* Search */}
          <input
            type="text"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(0); }}
            placeholder="Search transactions…"
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white w-48"
          />

          {/* Direction filter */}
          <select
            value={directionFilter}
            onChange={(e) => { setDirectionFilter(e.target.value as DirectionFilter); setPage(0); }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All types</option>
            <option value="debit">Debit only</option>
            <option value="credit">Credit only</option>
            <option value="transfer">Transfers</option>
          </select>

          {/* Multi-category filter */}
          <MultiCategorySelect
            categories={categories.data ?? []}
            selected={categoryFilters}
            onChange={(v) => { setCategoryFilters(v); setPage(0); }}
          />

          {(categoryFilters.length > 0 || directionFilter || searchText) && (
            <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-700 underline ml-1">
              Clear filters
            </button>
          )}
        </div>

        {/* Filter total */}
        {(categoryFilters.length > 0 || directionFilter || searchText) && txns.data && (
          <div className="mb-3 text-sm text-gray-600 bg-gray-50 rounded px-3 py-1.5 inline-block">
            Filtered total: <span className={`font-semibold tabular ${filteredTotal >= 0 ? 'text-gain' : 'text-loss'}`}>
              {filteredTotal >= 0 ? '+' : ''}{formatINR(Math.abs(filteredTotal))}
            </span>
            <span className="text-gray-400 ml-2">({totalRowCount} txns)</span>
          </div>
        )}

        <DataState isLoading={txns.isLoading} error={txns.error} isEmpty={rowCount === 0 && page === 0} emptyMessage="No transactions this month." onRetry={txns.refetch}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-gray-400 text-left">
                <th className="font-medium py-2">Merchant</th>
                <th className="font-medium py-2">Category</th>
                <th className="font-medium py-2">Account</th>
                <th className="font-medium py-2 text-right">Date</th>
                <th className="font-medium py-2 text-right">Amount</th>
                <th className="font-medium py-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  expanded={expandedRow === t.id}
                  onToggle={() => setExpandedRow(expandedRow === t.id ? null : t.id)}
                  categories={categories.data ?? []}
                  accountLabel={accountLabel}
                  aiKeyword={aiKeywordById[t.id] ?? t.aiKeyword ?? undefined}
                />
              ))}
            </tbody>
          </table>
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

// ── Transaction Row (expandable with edit/delete/note) ──────────────────────

function TransactionRow({ tx, expanded, onToggle, categories, accountLabel, aiKeyword }: {
  tx: ExpenseRow;
  expanded: boolean;
  onToggle: () => void;
  categories: { id: string; name: string }[];
  accountLabel: (id: number | null) => string;
  aiKeyword?: string;
}) {
  const updateTx = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();
  const setTags = useSetTxTags();
  const removeTag = useRemoveTxTag();
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editing, setEditing] = useState(false);

  const startEdit = () => {
    setEditAmount(String(tx.amount));
    setEditNote(tx.note ?? '');
    setEditing(true);
  };

  const saveEdit = async () => {
    const newAmount = parseFloat(editAmount);
    const updates: { id: number; amount?: number; note?: string | null } = { id: tx.id };
    if (!isNaN(newAmount) && newAmount > 0 && newAmount !== tx.amount) updates.amount = newAmount;
    if (editNote !== (tx.note ?? '')) updates.note = editNote || null;
    if (updates.amount !== undefined || updates.note !== undefined) {
      await updateTx.mutateAsync(updates);
    }
    setEditing(false);
  };

  const handleDelete = () => {
    if (confirm('Delete this transaction?')) {
      deleteTx.mutate(tx.id);
    }
  };

  return (
    <>
      <tr className={`border-t border-gray-50 ${expanded ? 'bg-gray-50/50' : ''}`}>
        <MerchantCell description={tx.description} />
        <td className="py-2.5 pr-3">
          <div className="flex flex-col gap-1">
            <CategoryChip txId={tx.id} categoryId={tx.categoryId} categorySource={tx.categorySource} aiKeyword={aiKeyword} merchantLabel={tx.description} categories={categories} />
            <TagChips tags={tx.tags} onAdd={(t) => setTags.mutate({ id: tx.id, tags: [t], mode: 'add' })} onRemove={(t) => removeTag.mutate({ id: tx.id, tag: t })} />
          </div>
        </td>
        <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{accountLabel(tx.accountId)}</td>
        <td className="py-2.5 pr-3 text-right text-gray-400 text-xs whitespace-nowrap">{formatDate(tx.transactionDate)}</td>
        <td className={`py-2.5 text-right tabular ${tx.direction === 'credit' ? 'text-gain' : ''}`}>
          {tx.direction === 'credit' ? '+' : '-'}{formatINR(tx.amount)}
        </td>
        <td className="py-2.5 text-center">
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-gray-600 text-xs px-1"
            title={expanded ? 'Collapse' : 'Edit/Delete'}
          >
            {expanded ? '▲' : '⋯'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50 border-t border-gray-100">
          <td colSpan={6} className="px-4 py-3">
            {editing ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs">
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="block w-32 border rounded px-2 py-1 mt-0.5 text-sm"
                  />
                </label>
                <label className="text-xs flex-1 min-w-[200px]">
                  Note
                  <input
                    type="text"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Add a note…"
                    className="block w-full border rounded px-2 py-1 mt-0.5 text-sm"
                  />
                </label>
                <button onClick={saveEdit} disabled={updateTx.isPending} className="text-xs bg-brand text-white px-3 py-1.5 rounded">
                  {updateTx.isPending ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                {tx.note && <span className="text-xs text-gray-600 italic">Note: {tx.note}</span>}
                <button onClick={startEdit} className="text-xs text-brand hover:underline">Edit</button>
                <button onClick={handleDelete} disabled={deleteTx.isPending} className="text-xs text-loss hover:underline">
                  {deleteTx.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Merchant Cell ───────────────────────────────────────────────────────────

function MerchantCell({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const merchant = deriveMerchantName(description);
  const collapsedText = merchant ?? description;

  return (
    <td className="py-2.5 pr-3 max-w-[280px] align-top">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Collapse' : 'Show full transaction'}
        aria-expanded={expanded}
        className="flex items-start gap-1 text-left w-full group"
      >
        <span className={`text-brand/60 mt-0.5 text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
        <span className={expanded ? 'break-words' : 'truncate min-w-0'}>
          {expanded ? description : collapsedText}
        </span>
      </button>
    </td>
  );
}

// ── Month Picker ────────────────────────────────────────────────────────────

function MonthPicker({ current, onSelect, onClose }: { current: string; onSelect: (m: string) => void; onClose: () => void }) {
  const [year, setYear] = useState(() => parseInt(current.split('-')[0]));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  return (
    <Card className="relative">
      <div className="flex justify-between items-center mb-3">
        <button onClick={() => setYear(y => y - 1)} className="text-gray-500 hover:text-gray-700 px-2">‹</button>
        <span className="font-heading text-sm">{year}</span>
        <button onClick={() => setYear(y => y + 1)} disabled={year >= currentYear} className="text-gray-500 hover:text-gray-700 px-2 disabled:opacity-40">›</button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {months.map((m, i) => {
          const key = `${year}-${String(i + 1).padStart(2, '0')}`;
          const isFuture = year > currentYear || (year === currentYear && i > currentMonthIdx);
          const isSelected = key === current;
          return (
            <button
              key={m}
              disabled={isFuture}
              onClick={() => onSelect(key)}
              className={`text-xs py-1.5 px-2 rounded transition-colors ${
                isSelected ? 'bg-brand text-white' : isFuture ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              {m}
            </button>
          );
        })}
      </div>
      <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
    </Card>
  );
}

// ── Multi-Category Select ───────────────────────────────────────────────────

function MultiCategorySelect({ categories, selected, onChange }: {
  categories: { id: string; name: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const label = selected.length === 0
    ? 'All categories'
    : selected.length === 1
      ? (selected[0] === '__ai__' ? 'AI suggested' : selected[0] === '__uncategorized__' ? 'Uncategorized' : categories.find(c => c.id === selected[0])?.name ?? selected[0])
      : `${selected.length} categories`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white flex items-center gap-1 min-w-[140px]"
      >
        <span className="truncate">{label}</span>
        <span className="text-[10px] text-gray-400 ml-auto">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-20 w-56 max-h-64 overflow-auto py-1">
          <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
            <input type="checkbox" checked={selected.includes('__ai__')} onChange={() => toggle('__ai__')} className="rounded" />
            <span className="text-violet-700">AI suggested</span>
          </label>
          <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
            <input type="checkbox" checked={selected.includes('__uncategorized__')} onChange={() => toggle('__uncategorized__')} className="rounded" />
            <span className="text-amber-700">Uncategorized</span>
          </label>
          <div className="border-t my-1" />
          {categories.map(c => (
            <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="rounded" />
              {c.name}
            </label>
          ))}
          <div className="border-t my-1" />
          <button onClick={() => { onChange([]); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
            Clear all
          </button>
        </div>
      )}
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
    </div>
  );
}

// ── Add Transaction Modal ───────────────────────────────────────────────────

function AddTransactionModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: { id: string; name: string }[] }) {
  const createTx = useCreateTransaction();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const amt = parseFloat(amount);
    if (!date || !description.trim() || isNaN(amt) || amt <= 0) {
      setErr('Date, description, and a positive amount are required.');
      return;
    }
    try {
      await createTx.mutateAsync({
        transactionDate: date,
        description: description.trim(),
        amount: amt,
        direction,
        categoryId: categoryId || null,
        note: note.trim() || null,
      });
      setDescription(''); setAmount(''); setNote(''); setCategoryId('');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create transaction.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Transaction">
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded p-2 mt-1" />
        </label>
        <label className="text-sm">
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border rounded p-2 mt-1" placeholder="e.g., Coffee at Starbucks" />
        </label>
        <div className="flex gap-3">
          <label className="text-sm flex-1">
            Amount
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border rounded p-2 mt-1" placeholder="0.00" />
          </label>
          <label className="text-sm">
            Type
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'debit' | 'credit')} className="w-full border rounded p-2 mt-1">
              <option value="debit">Debit (expense)</option>
              <option value="credit">Credit (income)</option>
            </select>
          </label>
        </div>
        <label className="text-sm">
          Category (optional)
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full border rounded p-2 mt-1">
            <option value="">None</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border rounded p-2 mt-1" placeholder="Add a note…" />
        </label>
        {err && <div className="text-loss text-sm">{err}</div>}
        <button onClick={submit} disabled={createTx.isPending} className="bg-brand text-white rounded-lg py-2 mt-2">
          {createTx.isPending ? 'Creating…' : 'Add transaction'}
        </button>
      </div>
    </Modal>
  );
}
