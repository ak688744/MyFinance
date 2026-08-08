import { CategoryChip } from './CategoryChip';
import type { SplitResult } from '../../types';
import { formatINR } from '../../lib/format';

export function SplitPanel({ result, merchantLabel, categories, onDone }: {
  result: SplitResult;
  merchantLabel: string;
  categories: { id: string; name: string }[];
  onDone: () => void;
}) {
  const target = result.detectedTotal ?? result.parentAmount;
  return (
    <div className="bg-[#F9FAFB] rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
        Split statement — {merchantLabel}
      </div>
      <div className={`rounded-lg px-3 py-2 text-sm flex items-center justify-between ${result.matched ? 'bg-gain/10 border border-gain/30 text-gain-800' : 'bg-amber-50 border border-amber-300 text-amber-800'}`}>
        <span>
          {result.matched ? '✓ ' : '⚠ '}
          Parsed {formatINR(result.parsedTotal)} of {formatINR(target)}
          {result.matched ? ' · Matched' : ` · off by ${formatINR(Math.abs(result.parsedTotal - target))}`}
        </span>
        <span>{result.children.length} items</span>
      </div>
      {result.carryover > 0 && (
        <div className="mt-1 text-[12px] text-gray-500">
          Carryover / not itemized: {formatINR(result.carryover)}
        </div>
      )}
      <ul className="mt-3 divide-y divide-gray-200">
        {result.children.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <span className="flex-1 text-sm">{c.description}</span>
            <CategoryChip txId={c.id} categoryId={c.categoryId} merchantLabel={c.description}
              categories={categories} categorySource={c.categorySource} />
            <span className={`tabular text-sm ${c.direction === 'credit' ? 'text-gain' : ''}`}>
              {c.direction === 'credit' ? '-' : ''}{formatINR(c.amount)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button onClick={onDone} className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium">
          Confirm split
        </button>
      </div>
    </div>
  );
}
