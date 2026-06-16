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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="font-heading text-2xl">Expenses</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="text-sm border border-brand text-brand rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors"
          >
            + Import expenses
          </button>
          <button
            onClick={() => setManageModalOpen(true)}
            className="text-sm bg-white border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            Manage categories & rules
          </button>
        </div>
      </div>

      <ManageCategoriesModal open={manageModalOpen} onClose={() => setManageModalOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      <DataState isLoading={summary.isLoading} error={summary.error} onRetry={summary.refetch}>
        {summary.data && (
          <div className="grid grid-cols-3 gap-4">
            <KPIStat label="Total Spent" value={formatINR(summary.data.totalSpent)} />
            <KPIStat label="Income" value={formatINR(summary.data.totalIncome)} />
            <KPIStat label="Saved" value={formatINR(summary.data.saved)} />
          </div>
        )}
      </DataState>

      <AIInsightCard text="Spending insights and category trends will be analysed by the assistant in L4." />

      <div className="grid grid-cols-2 gap-4">
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
        <div className="text-sm font-semibold mb-3">Recent Transactions</div>
        <DataState isLoading={txns.isLoading} error={txns.error} isEmpty={(txns.data ?? []).length === 0} emptyMessage="No transactions yet." onRetry={txns.refetch}>
          <div className="flex flex-col">
            {(txns.data ?? []).map((t) => (
              <div key={t.id} className="flex justify-between items-center text-sm py-2 border-t border-gray-50">
                <div className="flex items-center gap-3">
                  <CategoryChip txId={t.id} categoryId={t.categoryId} merchantLabel={t.description} categories={categories.data ?? []} />
                  <span>{t.description}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-gray-400 text-xs">{formatDate(t.transactionDate)}</span>
                  <span className={`tabular ${t.direction === 'credit' ? 'text-gain' : ''}`}>{formatINR(t.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </DataState>
      </Card>
    </div>
  );
}
