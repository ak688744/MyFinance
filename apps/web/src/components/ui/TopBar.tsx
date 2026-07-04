import { SearchIcon, BellIcon } from './icons';

/**
 * App-level top bar matching the mockups: page title + optional subtitle on the
 * left, a (non-functional placeholder) search, notifications and avatar on the
 * right. Search/notifications are intentionally inert — the data + L4 assistant
 * back them later; they exist here for visual parity, not fabricated behavior.
 */
export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-canvas/80 backdrop-blur px-8 py-4 border-b border-gray-200">
      <div className="flex items-baseline gap-3 min-w-0">
        <h1 className="font-heading font-bold text-xl text-gray-900 truncate">{title}</h1>
        {subtitle && <span className="text-sm text-gray-400 truncate">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-400 w-56">
          <SearchIcon width={16} height={16} />
          <span>Search…</span>
        </div>
        <button className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50" aria-label="Notifications">
          <BellIcon width={18} height={18} />
        </button>
        <div className="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-semibold">U</div>
      </div>
    </header>
  );
}
