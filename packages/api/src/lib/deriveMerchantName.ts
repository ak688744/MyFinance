/**
 * Derives a clean merchant name from bank transaction descriptions for display.
 * Parses structured formats (UPI/ACH/POS); returns null when no useful merchant
 * is derivable, so callers can fall back to the full description.
 *
 * Display-oriented sibling of core's extractMerchantKey (which lowercases/strips
 * for rule-matching); here we preserve a readable, title-cased name.
 *
 * Ported from apps/web/src/lib/format.ts deriveMerchantName.
 */

function cleanMerchantName(value: string | undefined | null): string | null {
  if (!value) return null;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  // Useful-merchant rules (mirrors core): >=3 chars, has a letter, not a masked
  // account like `xxxx1234`.
  if (collapsed.length < 3) return null;
  if (!/[a-zA-Z]/.test(collapsed)) return null;
  if (/^x+\d*$/i.test(collapsed)) return null;
  return collapsed
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

export function deriveMerchantName(description: string): string | null {
  const raw = (description ?? '').trim();
  if (!raw) return null;

  // UPI-<merchant>-<vpa>-<bank>-<ref>-<note> : merchant is the 2nd segment.
  if (/^UPI-/i.test(raw)) {
    return cleanMerchantName(raw.split('-')[1]);
  }

  // ACH D-<merchant>-... / ACH C-<merchant>
  const ach = raw.match(/^ACH\s+[DC]-\s*([A-Za-z0-9 .&]+?)(?:-\d|$)/i);
  if (ach?.[1]) return cleanMerchantName(ach[1]);

  // POS <card> <term> [date] [time] <merchant>
  const pos = raw.match(
    /^POS\s+\S+\s+\S+(?:\s+\d{2}[A-Z]{3}\d{2})?(?:\s+\d{2}:\d{2}:\d{2})?\s+(.+)$/i
  );
  if (pos?.[1]) return cleanMerchantName(pos[1]);

  return null;
}
