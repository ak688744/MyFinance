import type { CashFlow } from '../types';

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to Date object
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Calculate the difference in years between two dates (for XIRR calculation)
 */
export function yearsBetween(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = (date2.getTime() - date1.getTime()) / msPerDay;
  return days / 365;
}

/**
 * Calculate XIRR from cash flows using Newton-Raphson method
 * Cash flows: negative = investment (money out), positive = redemption (money in)
 * Final value should be added as positive cash flow on end date
 *
 * XIRR solves for rate where NPV = 0
 * NPV = sum of (cashFlow / (1 + rate)^years)
 */
export function calculateXIRR(
  cashFlows: CashFlow[]
): number | null {
  if (cashFlows.length < 2) {
    return null;
  }

  // Need at least one positive and one negative cash flow
  const hasPositive = cashFlows.some((cf) => cf.amount > 0);
  const hasNegative = cashFlows.some((cf) => cf.amount < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }

  // Parse dates and convert to years from first date
  const firstDate = parseDate(cashFlows[0].date);
  const flows = cashFlows.map((cf) => ({
    amount: cf.amount,
    years: yearsBetween(firstDate, parseDate(cf.date)),
  }));

  // NPV function: sum of cashFlow / (1 + rate)^years
  const npv = (rate: number): number => {
    return flows.reduce((sum, flow) => {
      const discountFactor = Math.pow(1 + rate, flow.years);
      return sum + flow.amount / discountFactor;
    }, 0);
  };

  // Derivative of NPV function
  const npvDerivative = (rate: number): number => {
    return flows.reduce((sum, flow) => {
      if (flow.years === 0) return sum;
      const discountFactor = Math.pow(1 + rate, flow.years);
      return sum - (flow.years * flow.amount) / ((1 + rate) * discountFactor);
    }, 0);
  };

  // Newton-Raphson iteration
  const maxIterations = 100;
  const tolerance = 1e-7;
  let rate = 0.1; // Initial guess: 10%

  for (let i = 0; i < maxIterations; i++) {
    const npvValue = npv(rate);
    const npvDeriv = npvDerivative(rate);

    // Check for convergence on NPV
    if (Math.abs(npvValue) < tolerance) {
      return rate;
    }

    // Check for division by zero or very small derivative
    if (Math.abs(npvDeriv) < 1e-10) {
      rate = rate > 0 ? rate * 0.5 : rate * 2;
      continue;
    }

    // Newton-Raphson step
    const newRate = rate - npvValue / npvDeriv;

    // Clamp to valid range
    const clampedRate = Math.max(-0.99, Math.min(10, newRate));

    // Check for convergence based on rate change
    if (Math.abs(clampedRate - rate) < tolerance) {
      return clampedRate;
    }

    rate = clampedRate;
  }

  // If Newton-Raphson didn't converge, try bisection method
  return bisectionXIRR(flows);
}

/**
 * Fallback bisection method for XIRR when Newton-Raphson fails
 */
function bisectionXIRR(
  flows: Array<{ amount: number; years: number }>
): number | null {
  const npv = (rate: number): number => {
    return flows.reduce((sum, flow) => {
      const discountFactor = Math.pow(1 + rate, flow.years);
      return sum + flow.amount / discountFactor;
    }, 0);
  };

  let low = -0.99;
  let high = 10;
  const maxIterations = 100;
  const tolerance = 1e-7;

  // Check if solution exists in range
  const npvLow = npv(low);
  const npvHigh = npv(high);

  if (npvLow * npvHigh > 0) {
    // No sign change, no solution in range
    return null;
  }

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid);

    if (Math.abs(npvMid) < tolerance || (high - low) / 2 < tolerance) {
      return mid;
    }

    if (npvMid * npvLow < 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return null;
}
