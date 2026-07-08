export type AiProviderDTO = {
  id: string;
  dialect: string;
  label: string;
  hasSecret: boolean;
  config: Record<string, unknown> | null;
  createdAt: string;
};

export type AiModelDTO = {
  id: string;
  providerId: string;
  modelString: string;
  label: string;
  inputPerM: number;
  outputPerM: number;
  createdAt: string;
};

export type AiTaskDTO = {
  task: string;
  label: string;
  description: string;
  defaultDialect: string | null;
  assignedModelId: string | null;
  configured: boolean;
};

export type AiUsageSummaryDTO = {
  totalCostUsd: number;
  totalInput: number;
  totalOutput: number;
  callCount: number;
  unpricedCount: number;
  byTask: {
    task: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    calls: number;
  }[];
  byModel: {
    model: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    calls: number;
  }[];
  byDay: {
    day: string;
    costUsd: number;
  }[];
};

export type AiUsageEventDTO = {
  id: number;
  task: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  createdAt: string;
};

export type AiPricingHintDTO = {
  inputPerM: number;
  outputPerM: number;
} | null;
