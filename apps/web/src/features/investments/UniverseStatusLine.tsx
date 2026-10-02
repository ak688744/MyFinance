// apps/web/src/features/investments/UniverseStatusLine.tsx
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRefreshUniverse, useUniverseStatus } from '../../lib/hooks';
import { universeNeedsRefresh } from './reviewLanes';

const LAST_ATTEMPT_KEY = 'myfinance.universe.lastAutoRefresh.v1';
const ATTEMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function recentlyAttempted(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(LAST_ATTEMPT_KEY);
    return raw != null && now - Number(raw) < ATTEMPT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markAttempted(now = Date.now()) {
  try {
    localStorage.setItem(LAST_ATTEMPT_KEY, String(now));
  } catch {
    /* storage unavailable: cooldown just won't persist */
  }
}

/** One quiet line for the monthly fund-performance universe, with auto-rebuild (at most once a day). */
export function UniverseStatusLine() {
  const status = useUniverseStatus();
  const refresh = useRefreshUniverse();
  const qc = useQueryClient();
  const autoTried = useRef(false);
  const lastBuiltAt = useRef<string | null | undefined>(undefined);
  const s = status.data;

  useEffect(() => {
    if (autoTried.current || !universeNeedsRefresh(s) || refresh.isPending || recentlyAttempted()) return;
    autoTried.current = true;
    markAttempted();
    refresh.mutate();
  }, [s, refresh]);

  // A finished rebuild changes the review signature, so fetch the review again.
  useEffect(() => {
    const built = s?.builtAt ?? null;
    if (lastBuiltAt.current !== undefined && built && built !== lastBuiltAt.current) {
      qc.invalidateQueries({ queryKey: ['investmentReview'] });
    }
    lastBuiltAt.current = built;
  }, [s?.builtAt, qc]);

  if (!s) return null;
  const running = s.state === 'running';
  const text = running
    ? `Performance data: rebuilding${s.progress ? ` · ${s.progress.done} of ${s.progress.total} funds` : '…'}`
    : s.state === 'failed'
      ? 'Performance data: last refresh failed'
      : s.asOf
        ? `Performance data as of ${s.asOf}`
        : 'Performance data not built yet';

  return (
    <div className="flex items-center gap-2 px-1 text-xs text-ink-muted">
      <span title={s.lastError ?? undefined}>{text}</span>
      <button
        type="button"
        onClick={() => refresh.mutate()}
        disabled={running || refresh.isPending}
        className="font-medium text-ai hover:text-ai/80 disabled:opacity-50"
      >
        {running ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}
