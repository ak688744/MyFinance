import { useState } from 'react';
import { ChevronDownIcon, CheckIcon } from '../../components/ui/icons';

export type DirectionFilter = '' | 'debit' | 'credit' | 'transfer';

const SEGMENTS: { value: DirectionFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'credit', label: 'Income' },
  { value: 'debit', label: 'Expense' },
  { value: 'transfer', label: 'Transfers' },
];

export function TypeSegmentedControl({ value, onChange }: { value: DirectionFilter; onChange: (v: DirectionFilter) => void }) {
  return (
    <div role="group" aria-label="Transaction type" className="bg-[#F1F5F9] rounded-lg p-0.5 flex">
      {SEGMENTS.map((s) => {
        const active = s.value === value;
        return (
          <button
            key={s.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.value)}
            className={`text-xs font-medium rounded-md px-2.5 py-1.5 cursor-pointer transition-colors ${
              active ? 'bg-white text-brand shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckRow({ checked, onToggle, children, className = '' }: { checked: boolean; onToggle: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-left ${className}`}
    >
      <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${checked ? 'bg-brand border-brand text-white' : 'border-gray-300 bg-white'}`}>
        {checked && <CheckIcon width={10} height={10} strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

export function CategoryFilterButton({ categories, selected, onChange }: {
  categories: { id: string; name: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white flex items-center gap-1.5 cursor-pointer"
      >
        Category
        {selected.length > 0 && (
          <span className="bg-brand text-white rounded-full text-[10.5px] leading-none px-1.5 py-1">{selected.length}</span>
        )}
        <ChevronDownIcon width={14} height={14} className="text-gray-400" />
      </button>
      {open && <div data-testid="category-catcher" className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-[10px] shadow-lg z-20 w-[200px] max-h-64 overflow-auto py-1">
          <CheckRow checked={selected.includes('__ai__')} onToggle={() => toggle('__ai__')} className="text-violet-700">AI suggested</CheckRow>
          <CheckRow checked={selected.includes('__uncategorized__')} onToggle={() => toggle('__uncategorized__')} className="text-amber-700">Uncategorized</CheckRow>
          <div className="border-t my-1" />
          {categories.map((c) => (
            <CheckRow key={c.id} checked={selected.includes(c.id)} onToggle={() => toggle(c.id)}>{c.name}</CheckRow>
          ))}
          {selected.length > 0 && (
            <>
              <div className="border-t my-1" />
              <button type="button" onClick={() => { onChange([]); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                Clear category filter
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
