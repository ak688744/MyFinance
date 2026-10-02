import type { NavPoint } from '../../types';

export const AMFI_NAV_LIST_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';
export const MFAPI_BASE = 'https://api.mfapi.in/mf';

/** mfapi returns newest-first DD-MM-YYYY string NAVs; normalise to ascending finite points. */
export function parseMfapiHistory(json: unknown): NavPoint[] {
  const data = (json as { data?: { date?: string; nav?: string }[] })?.data;
  if (!Array.isArray(data)) return [];
  const out: NavPoint[] = [];
  for (const e of data) {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(e?.date ?? '');
    const nav = Number(e?.nav);
    if (!m || !Number.isFinite(nav) || nav <= 0) continue;
    out.push({ date: `${m[3]}-${m[2]}-${m[1]}`, nav });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchAmfiNavList(fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(AMFI_NAV_LIST_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`AMFI NAV list download failed: ${res.status}`);
  return res.text();
}

/** Deliberately uncached (unlike navService): the universe rebuild fetches ~1,750 histories once a month. */
export async function fetchMfapiHistory(amfiCode: string, fetchImpl: typeof fetch = fetch): Promise<NavPoint[]> {
  const res = await fetchImpl(`${MFAPI_BASE}/${encodeURIComponent(amfiCode)}`);
  if (!res.ok) throw new Error(`mfapi ${amfiCode}: ${res.status}`);
  return parseMfapiHistory(await res.json());
}
