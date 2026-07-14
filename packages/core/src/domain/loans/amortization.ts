import { parseDate, formatDate } from '../xirr';
import type { Liability, AmortizationRow, LoanStatus } from '../../types';

/** Standard reducing-balance EMI. annualRate in %, tenure in months. */
export function computeEmi(
  principal: number,
  annualRate: number,
  tenureMonths: number,
): number {
  const i = annualRate / 12 / 100;
  if (i === 0) return principal / tenureMonths;
  const f = Math.pow(1 + i, tenureMonths);
  return (principal * i * f) / (f - 1);
}

/** Derive tenure (months) from a known EMI. */
function deriveTenure(
  principal: number,
  annualRate: number,
  emi: number,
): number {
  const i = annualRate / 12 / 100;
  if (i === 0) return Math.ceil(principal / emi);
  // n = -ln(1 - P·i/EMI) / ln(1+i)
  const n = -Math.log(1 - (principal * i) / emi) / Math.log(1 + i);
  return Math.max(1, Math.round(n));
}

/** Add `months` calendar months to a YYYY-MM-DD date (local). */
function addMonths(dateStr: string, months: number): string {
  const d = parseDate(dateStr);
  return formatDate(new Date(d.getFullYear(), d.getMonth() + months, d.getDate()));
}

/**
 * Month-by-month reducing-balance schedule. First payment is due one month
 * after start_date. Uses emiAmount if supplied (deriving tenure), else computes
 * the EMI from tenureMonths.
 */
export function amortizationSchedule(loan: Liability): AmortizationRow[] {
  const i = loan.annualRate / 12 / 100;
  let tenure: number;
  let emi: number;

  if (loan.emiAmount != null && loan.tenureMonths == null) {
    emi = loan.emiAmount;
    tenure = deriveTenure(loan.principal, loan.annualRate, emi);
  } else {
    tenure = loan.tenureMonths ?? 0;
    emi = loan.emiAmount ?? computeEmi(loan.principal, loan.annualRate, tenure);
  }

  const rows: AmortizationRow[] = [];
  let balance = loan.principal;
  for (let k = 1; k <= tenure; k++) {
    const interest = balance * i;
    let principalComp = emi - interest;
    // Last row: clamp so balance lands on 0 exactly.
    if (k === tenure || principalComp > balance) {
      principalComp = balance;
    }
    balance = Math.max(0, balance - principalComp);
    rows.push({
      period: k,
      dueDate: addMonths(loan.startDate, k),
      emi: principalComp + interest,
      principalComponent: principalComp,
      interestComponent: interest,
      balance,
    });
    if (balance <= 0) break;
  }
  return rows;
}

/** Derived current state of a loan as of `today`. */
export function loanStatus(
  loan: Liability,
  today: Date = new Date(),
): LoanStatus {
  const schedule = amortizationSchedule(loan);
  const todayStr = formatDate(today);

  // A payment due exactly today has not been made yet — it is the next due, not
  // paid. So "paid" is strictly before today; "remaining" is on-or-after today.
  const paid = schedule.filter((r) => r.dueDate < todayStr);
  const remaining = schedule.filter((r) => r.dueDate >= todayStr);

  const outstanding = paid.length > 0 ? paid[paid.length - 1].balance : loan.principal;
  const paidPrincipal = loan.principal - outstanding;
  const interestPaid = paid.reduce((s, r) => s + r.interestComponent, 0);
  const interestRemaining = remaining.reduce((s, r) => s + r.interestComponent, 0);
  const nextDueDate = remaining.length > 0 ? remaining[0].dueDate : null;

  return {
    outstanding,
    paidPrincipal,
    interestPaid,
    interestRemaining,
    monthsRemaining: remaining.length,
    nextDueDate,
    progressPercent: loan.principal > 0 ? (paidPrincipal / loan.principal) * 100 : 0,
  };
}
