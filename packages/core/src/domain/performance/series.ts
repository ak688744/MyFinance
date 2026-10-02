import type { NavPoint } from '../../types';

export type Series = NavPoint[];

/** A NAV lookup accepts the latest observation up to this many days before the requested date. */
export const LOOKUP_TOLERANCE_DAYS = 10;
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const nd = Math.min(d, lastDayOfMonth(ny, nm));
  return `${ny}-${pad(nm + 1)}-${pad(nd)}`;
}

export function monthEndOf(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m - 1))}`;
}

export function previousMonthEnd(date: string): string {
  return monthEndOf(shiftMonths(`${date.slice(0, 8)}01`, -1));
}

export function navOn(series: Series, date: string, toleranceDays = LOOKUP_TOLERANCE_DAYS): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= date) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return null;
  return daysBetween(series[idx].date, date) <= toleranceDays ? series[idx].nav : null;
}

export function toMonthEnd(series: Series): Series {
  const out: Series = [];
  for (const p of series) {
    const last = out[out.length - 1];
    if (last && last.date.slice(0, 7) === p.date.slice(0, 7)) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}
