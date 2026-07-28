import type { ReactNode } from 'react';

type Props = {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  children: ReactNode;
};

export function DataState({ isLoading, error, isEmpty, emptyMessage = 'No data yet.', onRetry, children }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-ink-muted py-12 justify-center">
        <span className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }
  if (error) {
    const msg = error instanceof Error ? error.message : 'Something went wrong.';
    return (
      <div className="bg-red-50 border border-red-100 text-loss text-sm rounded-card p-4">
        {msg}
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-3 underline font-medium cursor-pointer hover:text-loss/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loss rounded">
            Retry
          </button>
        )}
      </div>
    );
  }
  if (isEmpty) return <div className="text-sm text-ink-subtle py-12 text-center border border-dashed border-border rounded-card bg-canvas/30">{emptyMessage}</div>;
  return <>{children}</>;
}
