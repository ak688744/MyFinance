import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, apiUpload } from './apiClient';
import { qk } from './queryKeys';
import type {
  NetWorthSummary, NetWorthPoint, PortfolioSummary, PeriodReturns, Holding,
  AssetAllocation, ValuedAsset, Account, ExpenseRow, ExpenseSummary,
  Category, CategoryRule, LiabilityDetail, LiabilityListItem, Insight,
} from '../types';
import type {
  AiProviderDTO, AiModelDTO, AiTaskDTO, AiUsageSummaryDTO, AiUsageEventDTO, AiPricingHintDTO,
} from '../features/ai/types';

export const useNetWorth = () => useQuery({ queryKey: qk.networth(), queryFn: () => apiGet<NetWorthSummary>('/networth') });
export const useNetWorthHistory = (dates: string) =>
  useQuery({ queryKey: qk.networthHistory(dates), queryFn: () => apiGet<NetWorthPoint[]>('/networth/history', { dates }), enabled: dates.length > 0 });
export const useInvestmentSummary = (account?: string) =>
  useQuery({
    queryKey: qk.investmentSummary(account),
    queryFn: () => apiGet<PortfolioSummary>('/investments/summary', account ? { account } : undefined),
  });
export const useReturns = (period: string) => useQuery({ queryKey: qk.returns(period), queryFn: () => apiGet<PeriodReturns>('/investments/returns', { period }) });
export const useHoldings = (account?: string) => useQuery({ queryKey: qk.holdings(account), queryFn: () => apiGet<Holding[]>('/investments/holdings', account ? { account } : undefined) });
export const useAllocation = (account?: string) => useQuery({ queryKey: qk.allocation(account), queryFn: () => apiGet<AssetAllocation>('/investments/allocation', account ? { account } : undefined) });
export const useInvestmentAccounts = () => useQuery({ queryKey: qk.investmentAccounts(), queryFn: () => apiGet<string[]>('/investments/accounts') });
export const useAssets = (account?: string, assetClass?: string) =>
  useQuery({ queryKey: qk.assets(account, assetClass), queryFn: () => apiGet<ValuedAsset[]>('/assets', { ...(account ? { account } : {}), ...(assetClass ? { assetClass } : {}) }) });
export const useLiabilities = (status?: string) => useQuery({ queryKey: qk.liabilities(status), queryFn: () => apiGet<LiabilityListItem[]>('/liabilities', status ? { status } : undefined) });
export const useLiability = (id: string) => useQuery({ queryKey: qk.liability(id), queryFn: () => apiGet<LiabilityDetail>(`/liabilities/${id}`), enabled: !!id });
export const useExpenses = (params: Record<string, string | undefined>) =>
  useQuery({ queryKey: qk.expenses(params), queryFn: () => apiGet<ExpenseRow[]>('/expenses', params) });
export const useExpenseSummary = (params: Record<string, string | undefined>) =>
  useQuery({ queryKey: qk.expenseSummary(params), queryFn: () => apiGet<ExpenseSummary>('/expenses/summary', params) });
export const useExpenseInsights = (month: string) =>
  useQuery({ queryKey: qk.expenseInsights(month), queryFn: () => apiGet<Insight[]>('/expenses/insights', { month }), enabled: !!month });
export const useCategories = () => useQuery({ queryKey: qk.categories(), queryFn: () => apiGet<Category[]>('/categories') });
export const useAccounts = (domain?: string) => useQuery({ queryKey: qk.accounts(domain), queryFn: () => apiGet<Account[]>('/accounts', domain ? { domain } : undefined) });

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiSend<{ id: number }>('POST', '/assets', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['networth'] });
      qc.invalidateQueries({ queryKey: ['investments', 'accounts'] });
    },
  });
}

export function useCreateLiability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiSend<{ id: number }>('POST', '/liabilities', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['liabilities'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}

export function useUpdateLiability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; body: Record<string, unknown> }) =>
      apiSend<{ id: number }>('PATCH', `/liabilities/${v.id}`, v.body),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: ['liabilities'] });
      qc.invalidateQueries({ queryKey: ['liability', String(v.id)] });
      qc.invalidateQueries({ queryKey: ['networth'] });
    },
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiSend<{ id: number }>('POST', '/accounts', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['investments', 'accounts'] });
    },
  });
}

export function useImportFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, form }: { path: string; form: FormData }) => apiUpload<unknown>(path, form),
    onSuccess: () => { qc.invalidateQueries(); },
  });
}

export const useRules = () => useQuery({ queryKey: qk.rules(), queryFn: () => apiGet<CategoryRule[]>('/categories/rules') });

export function useUpdateTxCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; categoryId: string | null; createRuleMerchant?: boolean; createRuleKeyword?: boolean; keyword?: string }) =>
      apiSend<{ ok: boolean }>('PATCH', `/transactions/${v.id}/category`, {
        categoryId: v.categoryId,
        createRuleMerchant: v.createRuleMerchant,
        createRuleKeyword: v.createRuleKeyword,
        keyword: v.keyword,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { name: string; icon?: string | null }) => apiSend<{ id: string }>('POST', '/categories', b), onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) });
}
export function useRenameCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; name: string }) => apiSend<{ id: string }>('PATCH', `/categories/${v.id}`, { name: v.name }), onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) });
}
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiSend<{ ok: boolean }>('DELETE', `/categories/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['expenses'] }); } });
}
export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { ruleType: 'merchant' | 'upi_note_keyword'; patternValue: string; categoryId: string }) => apiSend('POST', '/categories/rules', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['expenses'] }); } });
}
export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: number; categoryId: string; ruleType: 'merchant' | 'upi_note_keyword' | 'keyword' }) => apiSend('PATCH', `/categories/rules/${v.id}`, { categoryId: v.categoryId, ruleType: v.ruleType }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['expenses'] }); } });
}
export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => apiSend('DELETE', `/categories/rules/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['expenses'] }); } });
}
export function useRecategorize() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => apiSend('POST', '/recategorize', {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }) });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; amount?: number; note?: string | null }) =>
      apiSend<{ ok: boolean }>('PATCH', `/transactions/${v.id}`, { amount: v.amount, note: v.note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiSend<{ ok: boolean }>('DELETE', `/transactions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { transactionDate: string; description: string; amount: number; direction: 'debit' | 'credit'; categoryId?: string | null; note?: string | null; accountId?: number | null }) =>
      apiSend<{ id: number }>('POST', '/transactions', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}

export type AiSuggestResult = {
  suggestions: { transactionId: number; categoryId: string; keyword: string; confidence: number; reason?: string }[];
  counts: { suggested: number; skipped: number; total: number };
  usage: { inputTokens: number; outputTokens: number };
  warnings: string[];
};

export function useAiSuggest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { from: string; to: string }) => apiSend<AiSuggestResult>('POST', '/categories/ai-suggest', v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}

// AI Settings & Usage hooks
export const useAiProviders = () => useQuery({ queryKey: qk.ai.providers(), queryFn: () => apiGet<AiProviderDTO[]>('/ai/providers') });
export const useAiModels = (providerId?: string) =>
  useQuery({ queryKey: qk.ai.models(providerId), queryFn: () => apiGet<AiModelDTO[]>('/ai/models', providerId ? { providerId } : undefined) });
export const useAiTasks = () => useQuery({ queryKey: qk.ai.tasks(), queryFn: () => apiGet<AiTaskDTO[]>('/ai/tasks') });
export const useAiUsageSummary = (range: { from?: string; to?: string } = {}) =>
  useQuery({ queryKey: qk.ai.usageSummary(range), queryFn: () => apiGet<AiUsageSummaryDTO>('/ai/usage/summary', range) });
export const useAiUsageEvents = (filters: { from?: string; to?: string; task?: string; limit?: number; offset?: number } = {}) =>
  useQuery({ queryKey: qk.ai.usageEvents(filters), queryFn: () => apiGet<AiUsageEventDTO[]>('/ai/usage/events', filters) });
export const useAiPricingHint = (modelString: string) =>
  useQuery({ queryKey: qk.ai.pricingHint(modelString), queryFn: () => apiGet<AiPricingHintDTO>('/ai/pricing-hints', { modelString }), enabled: modelString.length > 0 });

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; dialect: string; label: string; apiKey?: string; config?: Record<string, unknown> }) =>
      apiSend<{ id: string }>('POST', '/ai/providers', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.providers() }); },
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; label?: string; apiKey?: string; config?: Record<string, unknown> }) =>
      apiSend<{ id: string }>('PATCH', `/ai/providers/${v.id}`, { label: v.label, apiKey: v.apiKey, config: v.config }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.providers() }); qc.invalidateQueries({ queryKey: qk.ai.models() }); },
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<{ ok: boolean }>('DELETE', `/ai/providers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.providers() }); qc.invalidateQueries({ queryKey: qk.ai.models() }); qc.invalidateQueries({ queryKey: qk.ai.tasks() }); },
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; providerId: string; modelString: string; label: string; inputPerM: number; outputPerM: number }) =>
      apiSend<{ id: string }>('POST', '/ai/models', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.models() }); },
  });
}

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; label?: string; inputPerM?: number; outputPerM?: number }) =>
      apiSend<{ id: string }>('PATCH', `/ai/models/${v.id}`, { label: v.label, inputPerM: v.inputPerM, outputPerM: v.outputPerM }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.models() }); },
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<{ ok: boolean }>('DELETE', `/ai/models/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.models() }); qc.invalidateQueries({ queryKey: qk.ai.tasks() }); },
  });
}

export function useSetTaskRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { task: string; modelId: string }) =>
      apiSend<{ ok: boolean }>('PUT', `/ai/tasks/${v.task}/route`, { modelId: v.modelId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.tasks() }); },
  });
}

export function useUnsetTaskRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: string) => apiSend<{ ok: boolean }>('DELETE', `/ai/tasks/${task}/route`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ai.tasks() }); },
  });
}

export function useSetTxTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tags, mode }: { id: number; tags: string[]; mode: 'add' | 'replace' }) =>
      apiSend('PATCH', `/transactions/${id}/tags`, { tags, mode }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenseInsights'] }); },
  });
}

export function useRemoveTxTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tag }: { id: number; tag: string }) =>
      apiSend('DELETE', `/transactions/${id}/tags/${encodeURIComponent(tag)}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenseInsights'] }); },
  });
}
