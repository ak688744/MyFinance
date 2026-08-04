export type TagSource = 'user' | 'agent';
export type Tag = { tag: string; source: TagSource };

function coerceSource(s: unknown): TagSource {
  return s === 'agent' ? 'agent' : 'user';
}

export function normalizeTags(raw: Tag[]): Tag[] {
  const out: Tag[] = [];
  const idx = new Map<string, number>();
  for (const t of raw) {
    if (!t || typeof t.tag !== 'string') continue;
    const tag = t.tag.trim().toLowerCase();
    if (!tag) continue;
    const source = coerceSource(t.source);
    const at = idx.get(tag);
    if (at === undefined) { idx.set(tag, out.length); out.push({ tag, source }); }
    else { out[at] = { tag, source }; } // last wins on source, keeps position
  }
  return out;
}

export function parseTags(json: string | null): Tag[] {
  if (!json) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const coerced: Tag[] = [];
  for (const e of parsed) {
    if (e && typeof (e as Tag).tag === 'string') {
      coerced.push({ tag: (e as Tag).tag, source: coerceSource((e as { source?: unknown }).source) });
    }
  }
  return normalizeTags(coerced);
}

export function serializeTags(tags: Tag[]): string | null {
  const n = normalizeTags(tags);
  return n.length ? JSON.stringify(n) : null;
}

export function mergeTags(existing: Tag[], incoming: Tag[]): Tag[] {
  return normalizeTags([...existing, ...incoming]);
}

export function removeTagFrom(existing: Tag[], tag: string): Tag[] {
  const key = tag.trim().toLowerCase();
  return existing.filter((t) => t.tag !== key);
}
