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
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  return formatINR(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
