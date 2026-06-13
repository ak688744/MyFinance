import type { FastifyInstance } from 'fastify';
import { amortizationSchedule, loanStatus, type Liability } from '@myfinance/core';

function httpError(message: string, statusCode: number): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = statusCode;
  return err;
}

const LOAN_TYPES = ['home', 'car', 'personal', 'other'];

type LiabilityBody = Partial<{
  accountId: number | null; name: string; loanType: string; principal: number;
  annualRate: number; tenureMonths: number | null; emiAmount: number | null;
  startDate: string; status: 'active' | 'closed';
}>;

export async function liabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: string } }>('/liabilities', async (req) => {
    const status = req.query.status;
    const data = app.repos.liabilityRepo.list(
      status === 'active' || status === 'closed' ? { status } : undefined,
    );
    return { data };
  });

  app.get<{ Params: { id: string } }>('/liabilities/:id', async (req) => {
    const loan = app.repos.liabilityRepo.getById(Number(req.params.id));
    if (!loan) throw httpError(`Liability ${req.params.id} not found.`, 404);
    return {
      data: {
        liability: loan,
        status: loanStatus(loan),
        schedule: amortizationSchedule(loan),
      },
    };
  });

  app.post<{ Body: LiabilityBody }>('/liabilities', async (req, reply) => {
    const b = req.body ?? {};
    if (!b.name || !b.loanType || !LOAN_TYPES.includes(b.loanType)) {
      throw httpError("Fields 'name' and a valid 'loanType' are required.", 400);
    }
    if (typeof b.principal !== 'number' || typeof b.annualRate !== 'number' || !b.startDate) {
      throw httpError("Fields 'principal', 'annualRate', 'startDate' are required.", 400);
    }
    if (b.tenureMonths == null && b.emiAmount == null) {
      throw httpError("Either 'tenureMonths' or 'emiAmount' must be provided.", 400);
    }
    const id = app.repos.liabilityRepo.create({
      accountId: b.accountId ?? null,
      name: b.name,
      loanType: b.loanType as Liability['loanType'],
      principal: b.principal,
      annualRate: b.annualRate,
      tenureMonths: b.tenureMonths ?? null,
      emiAmount: b.emiAmount ?? null,
      startDate: b.startDate,
      status: b.status ?? 'active',
    });
    reply.code(201);
    return { data: { id } };
  });

  app.patch<{ Params: { id: string }; Body: LiabilityBody }>('/liabilities/:id', async (req) => {
    const id = Number(req.params.id);
    if (!app.repos.liabilityRepo.getById(id)) throw httpError(`Liability ${id} not found.`, 404);
    const b = req.body ?? {};
    app.repos.liabilityRepo.update(id, {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.loanType !== undefined ? { loanType: b.loanType as Liability['loanType'] } : {}),
      ...(b.principal !== undefined ? { principal: b.principal } : {}),
      ...(b.annualRate !== undefined ? { annualRate: b.annualRate } : {}),
      ...(b.tenureMonths !== undefined ? { tenureMonths: b.tenureMonths } : {}),
      ...(b.emiAmount !== undefined ? { emiAmount: b.emiAmount } : {}),
      ...(b.startDate !== undefined ? { startDate: b.startDate } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
    });
    return { data: { id } };
  });

  app.delete<{ Params: { id: string } }>('/liabilities/:id', async (req) => {
    const id = Number(req.params.id);
    if (!app.repos.liabilityRepo.getById(id)) throw httpError(`Liability ${id} not found.`, 404);
    app.repos.liabilityRepo.delete(id);
    return { data: { id } };
  });
}
