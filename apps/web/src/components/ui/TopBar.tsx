import { SearchIcon, BellIcon } from './icons';

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-canvas/90 backdrop-blur-md px-6 py-3.5 border-b border-border">
      <div className="min-w-0">
        <h1 className="font-heading font-bold text-lg text-ink truncate tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted truncate mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className="hidden sm:flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink-subtle w-52 transition-colors duration-200 hover:border-border-strong"
          aria-hidden
        >
          <SearchIcon width={16} height={16} className="opacity-50" />
          <span>Search…</span>
        </div>
        <button
          type="button"
          className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-ink-muted hover:bg-canvas hover:text-ink transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="Notifications"
        >
          <BellIcon width={18} height={18} />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand to-brand-dark text-white flex items-center justify-center text-sm font-semibold shadow-sm">
          U
        </div>
      </div>
    </header>
  );
}
