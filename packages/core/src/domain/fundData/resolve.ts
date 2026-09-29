/**
 * Identifier resolvers for the unofficial fund-data sources.
 *
 * The `refresh_fund_data` path only has an AMFI code + the scheme name to work
 * with, but none of the three sources are addressable by AMFI code alone:
 *  - Groww fund pages use their own slug (e.g. a fund's *old* registered name),
 *    NOT a slug derivable from the current AMFI scheme name.
 *  - Tickertape holdings are keyed by an internal `M_XXXX` mfId.
 *  - Kuvera detail is keyed by a Kuvera scheme code (e.g. `PP001ZG-GR`).
 *
 * Each source exposes a search/list endpoint from which the right identifier
 * can be resolved. These are the PURE pickers over those responses (the
 * network glue lives in the adapters); they are unit-tested against captured
 * sample payloads.
 */

const STOP_WORDS = new Set([
  'fund', 'plan', 'growth', 'direct', 'regular', 'the', 'scheme', 'mutual',
  'idcw', 'dividend', 'payout', 'reinvestment', 'option',
]);

/** Lowercase alphanumeric significant tokens, stop-words removed. */
export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t)),
  );
}

/** Jaccard overlap of two token sets (0..1). */
export function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

const PLAN_QUALIFIERS = /\b(direct|regular|growth|plan|idcw|dividend|payout|reinvestment|option)\b/gi;

/**
 * Groww's search ranks poorly when the query carries the plan/option suffix
 * (e.g. "…Direct Growth" pushes the target fund out of the result window).
 * Return progressively-trimmed query variants to try, most-specific first.
 */
export function growwSearchQueries(schemeName: string): string[] {
  const full = schemeName.trim();
  const trimmed = full.replace(PLAN_QUALIFIERS, ' ').replace(/\s+/g, ' ').trim();
  const queries = [full];
  if (trimmed && trimmed.toLowerCase() !== full.toLowerCase()) queries.push(trimmed);
  return queries;
}

/**
 * Groww global-search response → the fund-page slug for a given AMFI code.
 * Groww returns each match with BOTH `scheme_code` (== AMFI code) and
 * `search_id` (the slug), so we match on the code exactly — no fuzzy naming.
 */
export function pickGrowwSlug(searchJson: unknown, amfiCode: string): string | null {
  const content = (searchJson as any)?.data?.content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item && String(item.scheme_code) === amfiCode) {
      const slug = item.search_id ?? item.id;
      return typeof slug === 'string' && slug.length > 0 ? slug : null;
    }
  }
  return null;
}

/**
 * Kuvera `fund_schemes/list.json` (nested category → subCategory → AMC → [{c,n}])
 * → the Kuvera scheme code best-matching a scheme name. Kuvera list entries
 * carry no AMFI code, so we token-match the name and require a strong overlap.
 */
export function pickKuveraCode(listJson: unknown, schemeName: string): string | null {
  const target = nameTokens(schemeName);
  if (target.size === 0) return null;
  const candidates: { code: string; score: number }[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const x of node) {
        if (x && typeof x === 'object' && typeof (x as any).c === 'string' && typeof (x as any).n === 'string') {
          candidates.push({ code: (x as any).c, score: tokenOverlap(target, nameTokens((x as any).n)) });
        } else {
          walk(x);
        }
      }
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) walk(v);
    }
  };
  walk(listJson);

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 && candidates[0].score >= 0.6 ? candidates[0].code : null;
}

/**
 * Tickertape search response → an `M_XXXX` mutual-fund sid best-matching a
 * scheme name. Best-effort: Tickertape's MF search shape is loosely typed, so
 * we scan any bucket for items whose id looks like an MF sid.
 */
export function pickTickertapeSid(searchJson: unknown, schemeName: string): string | null {
  const data = (searchJson as any)?.data;
  if (!data || typeof data !== 'object') return null;
  const target = nameTokens(schemeName);
  const candidates: { sid: string; score: number }[] = [];

  for (const bucket of Object.values(data as Record<string, unknown>)) {
    if (!Array.isArray(bucket)) continue;
    for (const item of bucket) {
      const sid = (item as any)?.sid ?? (item as any)?.id;
      const name = (item as any)?.name ?? (item as any)?.title;
      if (typeof sid === 'string' && /^M_[A-Z0-9]+$/i.test(sid) && typeof name === 'string') {
        candidates.push({ sid, score: tokenOverlap(target, nameTokens(name)) });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 && candidates[0].score >= 0.5 ? candidates[0].sid : null;
}
