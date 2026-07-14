import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { computeEmi, loanStatus, amortizationSchedule, type Liability } from '@myfinance/core';
import type { McpContext } from '../../context.js';
import { ok, errorResult, type ToolResult } from '../../shared/output.js';

function resolveEmi(loan: Liability): number | null {
  if (loan.emiAmount != null) return loan.emiAmount;
  if (loan.tenureMonths != null && loan.tenureMonths > 0) {
    return computeEmi(loan.principal, loan.annualRate, loan.tenureMonths);
  }
  return null;
}

export async function runLoansOverview(ctx: McpContext): Promise<ToolResult> {
  const loans = ctx.repos.liabilityRepo.list({ status: 'active' });
  return ok({
    loans: loans.map((l) => {
      const st = loanStatus(l);
      return {
        id: l.id,
        name: l.name,
        loanType: l.loanType,
        principalInr: l.principal,
        outstandingInr: st.outstanding,
        emiInr: resolveEmi(l),
        ratePercent: l.annualRate,
        nextDueDate: st.nextDueDate,
        progressPercent: st.progressPercent,
      };
    }),
  });
}

export async function runLoanAmortization(
  ctx: McpContext,
  input: { liabilityId: number },
): Promise<ToolResult> {
  const loan = ctx.repos.liabilityRepo.getById(input.liabilityId);
  if (!loan) return errorResult(`Liability ${input.liabilityId} not found.`);
  const schedule = amortizationSchedule(loan);
  return ok({
    liabilityId: loan.id,
    name: loan.name,
    schedule: schedule.map((row) => ({
      period: row.period,
      dueDate: row.dueDate,
      emiInr: row.emi,
      principalInr: row.principalComponent,
      interestInr: row.interestComponent,
      balanceInr: row.balance,
    })),
    truncated: false,
  });
}

export function registerLoanTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_loans_overview',
    {
      description:
        'All active loans with computed EMI, outstanding balance, next due date and ' +
        'payoff progress. Money fields are INR (`Inr`); `ratePercent` is the annual rate. ' +
        'Takes no input.',
      inputSchema: {},
    },
    async () => runLoansOverview(ctx),
  );

  server.registerTool(
    'get_loan_amortization',
    {
      description:
        'Full amortization schedule (per-payment principal/interest/balance) for one loan. ' +
        'Required `liabilityId` (number). Unknown id returns an error result. Money is INR.',
      inputSchema: { liabilityId: z.number().int() },
    },
    async (input) => runLoanAmortization(ctx, input),
  );
}
