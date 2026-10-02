export type AmfiNavRow = {
  amfiCode: string;
  schemeName: string;
  amc: string;
  category: string;
  structure: 'open' | 'close' | 'interval';
  plan: string;
  option: string;
  nav: number | null;
  navDate: string | null;
};

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export function parseAmfiDate(s: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((s ?? '').trim());
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

const GROUP_ALIASES: Record<string, string> = { 'income/debt oriented': 'Debt', income: 'Debt', growth: 'Equity' };

/** AMFI uses two header styles ("Equity Scheme - X" and "Equity Schemes - X"); map both to "Equity: X". */
export function normalizeCategory(raw: string): string {
  const idx = raw.indexOf(' - ');
  let group = (idx >= 0 ? raw.slice(0, idx) : raw).trim().replace(/\s+Schemes?$/i, '').trim();
  group = GROUP_ALIASES[group.toLowerCase()] ?? group;
  let sub = idx >= 0 ? raw.slice(idx + 3).trim() : '';
  if (/^ELSS/i.test(sub)) sub = 'ELSS';
  sub = sub.replace(/\s+Fund$/i, '').replace(/\s+/g, ' ').trim();
  return sub ? `${group}: ${sub}` : group;
}

export function parseAmfiNavList(text: string): AmfiNavRow[] {
  const rows: AmfiNavRow[] = [];
  let category: string | null = null;
  let structure: AmfiNavRow['structure'] = 'open';
  let amc = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = /^(Open Ended|Close Ended|Interval Fund) Schemes\s*\((.*)\)$/i.exec(line);
    if (header) {
      const kind = header[1].toLowerCase();
      structure = kind.startsWith('open') ? 'open' : kind.startsWith('close') ? 'close' : 'interval';
      category = normalizeCategory(header[2]);
      continue;
    }
    if (!line.includes(';')) {
      amc = line;
      continue;
    }
    const f = line.split(';').map((s) => s.trim());
    if (!/^\d+$/.test(f[0]) || !category) continue;
    let name: string, plan = '', option = '', navRaw: string, dateRaw: string;
    if (f.length >= 8) [name, plan, option, navRaw, dateRaw] = [f[3], f[4], f[5], f[6], f[7]];
    else if (f.length >= 6) [name, navRaw, dateRaw] = [f[3], f[4], f[5]];
    else continue;
    const nav = Number(navRaw);
    rows.push({
      amfiCode: f[0],
      schemeName: [name, plan, option].filter(Boolean).join(' '),
      amc,
      category,
      structure,
      plan,
      option,
      nav: Number.isFinite(nav) && nav > 0 ? nav : null,
      navDate: parseAmfiDate(dateRaw),
    });
  }
  return rows;
}

export function isDirectGrowth(row: AmfiNavRow): boolean {
  const planText = row.plan || row.schemeName;
  const optText = row.option || row.schemeName;
  const direct = /\bdirect\b/i.test(planText) && !/\bregular\b/i.test(planText);
  const growth = /\bgrowth\b/i.test(optText) && !/\b(idcw|dividend|bonus)\b/i.test(optText);
  return direct && growth && !/segregated/i.test(row.schemeName);
}

export function selectUniverse(rows: AmfiNavRow[]): AmfiNavRow[] {
  const seen = new Set<string>();
  const out: AmfiNavRow[] = [];
  for (const r of rows) {
    if (seen.has(r.amfiCode)) continue;
    if (r.structure !== 'open' || r.nav == null || !isDirectGrowth(r)) continue;
    if (/^Exchange Traded Funds/i.test(r.category) || /\bETF\b|\bBeES\b/i.test(r.schemeName)) continue;
    seen.add(r.amfiCode);
    out.push(r);
  }
  return out;
}

const EQUITY_TAXED_NON_EQUITY = new Set(['Hybrid: Arbitrage', 'Hybrid: Aggressive Hybrid', 'Hybrid: Equity Savings', 'Other: Index Funds']);

/** True when gains follow equity rules (Equity group, equity-oriented hybrids, equity index funds). */
export function isEquityTaxed(category: string): boolean {
  return category.startsWith('Equity:') || EQUITY_TAXED_NON_EQUITY.has(category);
}

export function isElssCategory(category: string): boolean {
  return category === 'Equity: ELSS';
}
