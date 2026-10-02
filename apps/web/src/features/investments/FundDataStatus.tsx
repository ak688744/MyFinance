import { useEffect, useRef } from 'react';
import { useFundDataCoverage, useRefreshFundData } from '../../lib/hooks';
import type { FundDataCoverage } from '../../types';

/** Holdings are published monthly; refresh when a snapshot is older than this. */
export const AUTO_REFRESH_AGE_DAYS = 35;
const LAST_ATTEMPT_KEY = 'myfinance.fundData.lastAutoRefresh.v1';
const ATTEMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** True when at least one refreshable fund has no holdings or an old snapshot. */
export function needsRefresh(coverage: FundDataCoverage[]): boolean {
  return coverage.some(
    (c) => c.refreshable && (!c.hasHoldings || (c.ageDays != null && c.ageDays > AUTO_REFRESH_AGE_DAYS)),
  );
}

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
    /* storage unavailable — cooldown just won't persist */
  }
}

/**
 * One quiet line describing fund-data coverage, with a manual Refresh button.
 * Also auto-refreshes (at most once a day) when holdings are older than a month.
 */
export function FundDataStatus({ account }: { account?: string }) {
  const coverage = useFundDataCoverage(account);
  const refresh = useRefreshFundData();
  const autoTried = useRef(false);

  const rows = coverage.data ?? [];
  const stale = needsRefresh(rows);

  useEffect(() => {
    if (autoTried.current || !stale || refresh.isPending || recentlyAttempted()) return;
    autoTried.current = true;
    markAttempted();
    refresh.mutate({ all: true });
  }, [stale, refresh]);

  if (rows.length === 0) return null;

  const covered = rows.filter((c) => c.hasHoldings).length;
  const unavailable = rows.filter((c) => !c.hasHoldings).length;
  const latest = rows.map((c) => c.asOfDate).filter((d): d is string => !!d).sort().pop();

  return (
    <div className="flex items-center gap-2 px-1 text-xs text-ink-muted">
      <span>
        Fund data: {covered} of {rows.length} funds analyzed
        {latest ? ` · holdings as of ${latest}` : ''}
        {unavailable > 0 ? ` · ${unavailable} unavailable from source` : ''}
      </span>
      <button
        type="button"
        onClick={() => refresh.mutate({ all: true })}
        disabled={refresh.isPending}
        className="font-medium text-ai hover:text-ai/80 disabled:opacity-50"
      >
        {refresh.isPending ? 'Refreshing…' : 'Refresh'}
      </button>
      {refresh.isError && <span className="text-red-600">Refresh failed</span>}
    </div>
  );
}
