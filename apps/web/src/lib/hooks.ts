import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, apiUpload } from './apiClient';
import { qk } from './queryKeys';
import type {
  NetWorthSummary, NetWorthPoint, PortfolioSummary, PeriodReturns, Holding,
  AssetAllocation, ValuedAsset, Liability, Account, ExpenseRow, ExpenseSummary,
  Category, LiabilityDetail,
} from '../types';

export const useNetWorth = () => useQuery({ queryKey: qk.networth(), queryFn: () => apiGet<NetWorthSummary>('/networth') });
export const useNetWorthHistory = (dates: string) =>
  useQuery({ queryKey: qk.networthHistory(dates), queryFn: () => apiGet<NetWorthPoint[]>('/networth/history', { dates }), enabled: dates.length > 0 });
export const useInvestmentSummary = () => useQuery({ queryKey: qk.investmentSummary(), queryFn: () => apiGet<PortfolioSummary>('/investments/summary') });
export const useReturns = (period: string) => useQuery({ queryKey: qk.returns(period), queryFn: () => apiGet<PeriodReturns>('/investments/returns', { period }) });
export const useHoldings = (account?: string) => useQuery({ queryKey: qk.holdings(account), queryFn: () => apiGet<Holding[]>('/investments/holdings', account ? { account } : undefined) });
export const useAllocation = (account?: string) => useQuery({ queryKey: qk.allocation(account), queryFn: () => apiGet<AssetAllocation>('/investments/allocation', account ? { account } : undefined) });
export const useInvestmentAccounts = () => useQuery({ queryKey: qk.investmentAccounts(), queryFn: () => apiGet<string[]>('/investments/accounts') });
export const useAssets = (account?: string, assetClass?: string) =>
  useQuery({ queryKey: qk.assets(account, assetClass), queryFn: () => apiGet<ValuedAsset[]>('/assets', { ...(account ? { account } : {}), ...(assetClass ? { assetClass } : {}) }) });
export const useLiabilities = (status?: string) => useQuery({ queryKey: qk.liabilities(status), queryFn: () => apiGet<Liability[]>('/liabilities', status ? { status } : undefined) });
export const useLiability = (id: string) => useQuery({ queryKey: qk.liability(id), queryFn: () => apiGet<LiabilityDetail>(`/liabilities/${id}`), enabled: !!id });
export const useExpenses = (params: Record<string, string | undefined>) =>
  useQuery({ queryKey: qk.expenses(params), queryFn: () => apiGet<ExpenseRow[]>('/expenses', params) });
export const useExpenseSummary = (params: Record<string, string | undefined>) =>
  useQuery({ queryKey: qk.expenseSummary(params), queryFn: () => apiGet<ExpenseSummary>('/expenses/summary', params) });
export const useCategories = () => useQuery({ queryKey: qk.categories(), queryFn: () => apiGet<Category[]>('/categories') });
export const useAccounts = (domain?: string) => useQuery({ queryKey: qk.accounts(domain), queryFn: () => apiGet<Account[]>('/accounts', domain ? { domain } : undefined) });

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiSend<{ id: number }>('POST', '/assets', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}

export function useCreateLiability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiSend<{ id: number }>('POST', '/liabilities', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['liabilities'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiSend<{ id: number }>('POST', '/accounts', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

export function useImportFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, form }: { path: string; form: FormData }) => apiUpload<unknown>(path, form),
    onSuccess: () => { qc.invalidateQueries(); },
  });
}
