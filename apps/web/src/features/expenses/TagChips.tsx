type Tag = { tag: string; source: 'user' | 'agent' };
const STARTER = ['recurring', 'one-time', 'subscription', 'reimbursable', 'work', 'personal'];

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
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border ${
            t.source === 'agent' ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-gray-50 border-gray-300 text-gray-600'
          }`}
        >
          {t.tag}
          <button type="button" aria-label={`Remove tag ${t.tag}`} onClick={() => onRemove(t.tag)} className="hover:text-gray-900 cursor-pointer">×</button>
        </span>
      ))}
      {/* Minimal add affordance: a datalist-backed input. Kept simple for v1. */}
      <TagAdd onAdd={onAdd} />
    </div>
  );
}

function TagAdd({ onAdd }: { onAdd: (tag: string) => void }) {
  return (
    <>
      <input
        list="tag-vocab"
        placeholder="+ tag"
        className="w-20 text-[11px] px-1.5 py-0.5 rounded-full border border-dashed border-gray-300 bg-transparent"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = (e.target as HTMLInputElement).value.trim();
            if (v) { onAdd(v); (e.target as HTMLInputElement).value = ''; }
          }
        }}
      />
      <datalist id="tag-vocab">{STARTER.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}
