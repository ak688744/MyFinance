import { Card, KPIStat } from '../../components/ui/primitives';
import { DataState } from '../../components/ui/DataState';
import { SpendBarChart } from '../../components/ui/charts';
import { useAiUsageSummary } from '../../lib/hooks';
import { formatUsd, toDailyBars } from './aiUsageTransforms';

export function UsageCostTab() {
  const summary = useAiUsageSummary();

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Strip */}
      <DataState
        isLoading={summary.isLoading}
        error={summary.error}
        isEmpty={!summary.data || summary.data.callCount === 0}
        emptyMessage="No AI usage recorded yet."
      >
        {summary.data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPIStat label="Total Spend" value={formatUsd(summary.data.totalCostUsd)} />
            <KPIStat
              label="This Month Spend"
              value={formatUsd(
                summary.data.byDay
                  .filter((d) => d.day.startsWith(new Date().toISOString().slice(0, 7)))
                  .reduce((sum, d) => sum + d.costUsd, 0)
              )}
            />
            <KPIStat
              label="Total Tokens"
              value={`${(summary.data.totalInput + summary.data.totalOutput).toLocaleString()}`}
            />
            <KPIStat label="Call Count" value={summary.data.callCount.toString()} />
          </div>
        )}
      </DataState>

      {/* Spend over time chart */}
      {summary.data && summary.data.byDay.length > 0 && (
        <Card>
          <div className="text-sm font-semibold mb-3">Spend Over Time</div>
          <SpendBarChart
            data={toDailyBars(summary.data).map((d) => ({ month: d.label, spent: d.value }))}
          />
        </Card>
      )}

      {/* By Task Breakdown */}
      {summary.data && summary.data.byTask.length > 0 && (
        <Card>
          <div className="text-sm font-semibold mb-3">Usage by Task</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-gray-400 text-left">
                <th className="font-medium py-2">Task</th>
                <th className="font-medium py-2 text-right">Cost</th>
                <th className="font-medium py-2 text-right">Input Tokens</th>
                <th className="font-medium py-2 text-right">Output Tokens</th>
                <th className="font-medium py-2 text-right">Calls</th>
              </tr>
            </thead>
            <tbody>
              {summary.data.byTask.map((t) => (
                <tr key={t.task} className="border-t border-gray-50">
                  <td className="py-2.5 pr-3">{t.task}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{formatUsd(t.costUsd)}</td>
                  <td className="py-2.5 pr-3 text-right tabular text-gray-500">
                    {t.inputTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular text-gray-500">
                    {t.outputTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right tabular text-gray-500">{t.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* By Model Breakdown */}
      {summary.data && summary.data.byModel.length > 0 && (
        <Card>
          <div className="text-sm font-semibold mb-3">Usage by Model</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-gray-400 text-left">
                <th className="font-medium py-2">Model</th>
                <th className="font-medium py-2 text-right">Cost</th>
                <th className="font-medium py-2 text-right">Input Tokens</th>
                <th className="font-medium py-2 text-right">Output Tokens</th>
                <th className="font-medium py-2 text-right">Calls</th>
              </tr>
            </thead>
            <tbody>
              {summary.data.byModel.map((m) => (
                <tr key={m.model} className="border-t border-gray-50">
                  <td className="py-2.5 pr-3 font-mono text-xs">{m.model}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{formatUsd(m.costUsd)}</td>
                  <td className="py-2.5 pr-3 text-right tabular text-gray-500">
                    {m.inputTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular text-gray-500">
                    {m.outputTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right tabular text-gray-500">{m.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Unpriced calls note */}
      {summary.data && summary.data.unpricedCount > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
          {summary.data.unpricedCount} call{summary.data.unpricedCount > 1 ? 's' : ''} unpriced
          (no pricing information available for the model used)
        </div>
      )}
    </div>
  );
}
