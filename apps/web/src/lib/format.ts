const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function groupIndian(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(Math.abs(value));
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${groupIndian(rounded)}`;
}

export function formatCompactINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  // Compact display per design spike: crore to 2 decimals (₹1.84Cr), lakh to 1 (₹11.8L).
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  return formatINR(value);
}

/**
 * Ultra-compact INR for chart labels/axes: ₹42K, ₹4.2L, ₹1.8Cr. Includes the
 * thousands (K) tier that formatCompactINR omits, and drops the decimal when
 * it is a whole number (₹5L not ₹5.0L). Use full formatINR in tooltips.
 */
export function formatCompactShort(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const fmt = (n: number, suffix: string) => `${sign}₹${n.toFixed(1).replace(/\.0$/, '')}${suffix}`;
  if (abs >= 1e7) return fmt(abs / 1e7, 'Cr');
  if (abs >= 1e5) return fmt(abs / 1e5, 'L');
  if (abs >= 1e3) return fmt(abs / 1e3, 'K');
  return formatINR(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

// ── Merchant name (Expenses table Merchant column) ──────────────────────────
// Bank descriptions are noisy (`UPI-SWIGGY-swiggy@axis-...`, `POS 1234 ... AMAZON`).
// Derive a clean display name from the structured formats; return null when
// nothing useful can be pulled out so callers fall back to the full description.
// Display-oriented sibling of core's extractMerchantKey (which lowercases/strips
// for rule-matching); here we preserve a readable, title-cased name.

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

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!m || m < 1 || m > 12 || !d || !y) return iso; // fallback on malformed input
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ── Month helpers (for the Expenses month selector) ─────────────────────────
// A "month key" is 'YYYY-MM'. transaction_date is 'YYYY-MM-DD', so string
// comparison on these keys is chronological.

/** Current month as 'YYYY-MM'. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Shift a 'YYYY-MM' key by `delta` months (can be negative). */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const zero = y * 12 + (m - 1) + delta; // months since year 0
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, '0')}`;
}

/** Inclusive date bounds for a month key, usable as ?from/?to filters. */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-31` };
}

/** 'July 2026' from a 'YYYY-MM' key. */
export function formatMonthLong(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${LONG[m - 1]} ${y}`;
}

/**
 * A window of up to `span*2+1` consecutive data-months centred on `selected`,
 * for the month-on-month chart. Centres on the selection but shifts to stay
 * within the available data — so if there are fewer than `span` months after
 * the selection, it shows more before it (and vice versa).
 */
export function monthWindow(allMonths: string[], selected: string, span = 3): string[] {
  const months = allMonths.includes(selected) ? [...allMonths] : [...allMonths, selected];
  months.sort();
  const idx = months.indexOf(selected);
  let start = idx - span;
  let end = idx + span;
  if (start < 0) { end += -start; start = 0; }
  if (end > months.length - 1) { start -= end - (months.length - 1); end = months.length - 1; }
  if (start < 0) start = 0;
  return months.slice(start, end + 1);
}
