import { useState } from 'react';

type Tag = { tag: string; source: 'user' | 'agent' };

/** Free-flowing, hashtag-style tags (like a social post) — type anything, no fixed vocabulary. */
export function TagChips({ tags, onAdd, onRemove }: {
  tags: Tag[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t.tag}
          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] border ${
            t.source === 'agent' ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-gray-50 border-gray-300 text-gray-600'
          }`}
        >
          <span aria-hidden className="opacity-50">#</span>
          <span>{t.tag}</span>
          <button type="button" aria-label={`Remove tag ${t.tag}`} onClick={() => onRemove(t.tag)} className="ml-0.5 hover:text-gray-900 cursor-pointer leading-none">×</button>
        </span>
      ))}
      <TagAdd onAdd={onAdd} />
    </div>
  );
}

function TagAdd({ onAdd }: { onAdd: (tag: string) => void }) {
  const [value, setValue] = useState('');

  const commit = () => {
    // Free-form: split on comma so users can type "dinner, treat" at once; strip a leading # if present.
    const parts = value.split(',').map((p) => p.trim().replace(/^#+/, '').trim()).filter(Boolean);
    for (const p of parts) onAdd(p);
    setValue('');
  };

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="# add tag"
      aria-label="Add tag"
      className="w-24 text-[11px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 bg-transparent focus:outline-none focus:border-brand focus:w-32 transition-all"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
    />
  );
}
