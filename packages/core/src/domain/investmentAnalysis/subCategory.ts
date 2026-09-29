export type SubCategory = { key: string; label: string };

/**
 * Ordered rules: the first match wins, so more specific patterns come first
 * (an "index" fund tracking a mid-cap index is an index fund, not a mid-cap one).
 */
const RULES: { key: string; label: string; test: RegExp }[] = [
  { key: 'elss', label: 'ELSS', test: /\b(elss|tax\s*saver)\b/i },
  { key: 'arbitrage', label: 'arbitrage', test: /\barbitrage\b/i },
  { key: 'index', label: 'index', test: /\b(index|nifty|sensex|etf)\b/i },
  { key: 'large_mid_cap', label: 'large & mid-cap', test: /\blarge\s*(&|and)\s*mid\s*cap\b/i },
  { key: 'large_cap', label: 'large-cap', test: /\b(large\s*cap|bluechip|blue\s*chip)\b/i },
  { key: 'mid_cap', label: 'mid-cap', test: /\bmid\s*cap\b/i },
  { key: 'small_cap', label: 'small-cap', test: /\bsmall\s*cap\b/i },
  { key: 'flexi_cap', label: 'flexi-cap', test: /\bflexi\s*cap\b/i },
  { key: 'multi_cap', label: 'multi-cap', test: /\bmulti\s*cap\b/i },
  { key: 'focused', label: 'focused', test: /\bfocused\b/i },
  { key: 'value', label: 'value', test: /\b(value|contra)\b/i },
  { key: 'short_debt', label: 'short-duration debt', test: /\b(liquid|overnight|ultra\s*short|low\s*duration|money\s*market|short\s*(term|duration))\b/i },
];

/** Infers a fund's sub-category from its name; null when nothing recognisable. */
export function inferSubCategory(schemeName: string): SubCategory | null {
  // Normalise "Mid-cap"/"Small_Cap" style separators so the patterns above match.
  const name = schemeName.replace(/[-_]/g, ' ');
  for (const r of RULES) {
    if (r.test.test(name)) return { key: r.key, label: r.label };
  }
  return null;
}
