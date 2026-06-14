import { useExpenses, useExpenseSummary, useCategories } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { DonutChart, SpendBarChart } from '../../components/ui/charts';
import { formatINR, formatDate } from '../../lib/format';
import { summaryByCategoryWithNames } from '../../lib/transforms';

export function ExpensesPage() {
  const summary = useExpenseSummary({});
  const txns = useExpenses({ limit: '50' });
  const categories = useCategories();

  const byCategory = summary.data
    ? summaryByCategoryWithNames(summary.data.byCategory, categories.data ?? [])
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl">Expenses</h1>

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
        <DataState isLoading={txns.isLoading} error={txns.error} isEmpty={(txns.data ?? []).length === 0} emptyMessage="No transactions yet.">
          <div className="flex flex-col">
            {(txns.data ?? []).map((t) => (
              <div key={t.id} className="flex justify-between items-center text-sm py-2 border-t border-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-gray-100 rounded px-2 py-0.5">{t.categoryId ?? 'Uncategorized'}</span>
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
