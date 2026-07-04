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
  if (isLoading) return <div className="text-sm text-gray-400 py-8">Loading…</div>;
  if (error) {
    const msg = error instanceof Error ? error.message : 'Something went wrong.';
    return (
      <div className="bg-red-50 text-loss text-sm rounded-card p-4">
        {msg}
        {onRetry && <button onClick={onRetry} className="ml-3 underline">Retry</button>}
      </div>
    );
  }
  if (isEmpty) return <div className="text-sm text-gray-400 py-8">{emptyMessage}</div>;
  return <>{children}</>;
}
