import { useState } from 'react';
import { useExpenses, useExpenseSummary, useCategories } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { DonutChart, SpendBarChart } from '../../components/ui/charts';
import { formatINR, formatDate } from '../../lib/format';
import { summaryByCategoryWithNames } from '../../lib/transforms';
import { CategoryChip } from './CategoryChip';
import { ManageCategoriesModal } from './ManageCategoriesModal';
import { ImportModal } from '../imports/ImportModal';

export function ExpensesPage() {
  const summary = useExpenseSummary({});
  const txns = useExpenses({ limit: '50' });
  const categories = useCategories();
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const byCategory = summary.data
    ? summaryByCategoryWithNames(summary.data.byCategory, categories.data ?? [])
    : [];
  const savingsRate = summary.data && summary.data.totalIncome > 0
    ? (summary.data.saved / summary.data.totalIncome) * 100
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end items-center gap-2">
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

      <ManageCategoriesModal open={manageModalOpen} onClose={() => setManageModalOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      <DataState isLoading={summary.isLoading} error={summary.error} onRetry={summary.refetch}>
        {summary.data && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPIStat label="Total Spent" value={formatINR(summary.data.totalSpent)} />
            <KPIStat label="Income" value={formatINR(summary.data.totalIncome)} />
            <Card>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Saved</div>
              <div className="font-heading text-2xl mt-1 tabular text-gain">{formatINR(summary.data.saved)}</div>
              {savingsRate !== null && <div className="text-xs text-gray-400 mt-1 tabular">{savingsRate.toFixed(1)}% savings rate</div>}
            </Card>
          </div>
        )}
      </DataState>

      <AIInsightCard text="Spending insights and category trends will be analysed by the assistant in L4." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="text-sm font-semibold mb-3">Spending Breakdown</div>
          <DonutChart data={byCategory.map((c) => ({ name: c.name, value: c.amount }))} />
        </Card>
        <Card>
          <div className="text-sm font-semibold mb-3">Month-on-month Spend</div>
          <SpendBarChart data={summary.data?.byMonth ?? []} />
        </Card>
      </div>

      <Card>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold">Recent Transactions</div>
        </div>
        <DataState isLoading={txns.isLoading} error={txns.error} isEmpty={(txns.data ?? []).length === 0} emptyMessage="No transactions yet." onRetry={txns.refetch}>
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
              {(txns.data ?? []).map((t) => (
                <tr key={t.id} className="border-t border-gray-50">
                  <td className="py-2.5 pr-3 max-w-[280px] truncate">{t.description}</td>
                  <td className="py-2.5 pr-3">
                    <CategoryChip txId={t.id} categoryId={t.categoryId} merchantLabel={t.description} categories={categories.data ?? []} />
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500">{t.accountId != null ? `#${t.accountId}` : '—'}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-400 text-xs whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                  <td className={`py-2.5 text-right tabular ${t.direction === 'credit' ? 'text-gain' : ''}`}>
                    {t.direction === 'credit' ? '+' : '-'}{formatINR(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataState>
      </Card>
    </div>
  );
}
