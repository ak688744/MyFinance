export const AGENTS_VERSION = '0.0.0';

export { resolveProvider } from './llm/index';
export {
  LlmError, type LlmConfig, type LlmDialect, type LlmProvider, type LlmUsage, type LlmErrorKind,
} from './llm/types';
export { categorizeWithAI, type CategorizeResult, type CategorizeDeps } from './categorize/aiCategorize';
export { type AiSuggestion } from './categorize/schema';
export { type TxnForPrompt, type CategoryForPrompt } from './categorize/prompt';

export { makeLlmGateway, type GatewayDeps, type CompleteFn } from './gateway';
export { AI_TASKS, isAiTask, type AiTaskId } from './tasks';
export { buildProvider } from './llm/factory';
export { makeBedrockProvider, type BedrockLike } from './llm/bedrock';
export { costUsd, pricingHint, PRICING_HINTS } from './pricing';

export { triageInsights, applyCadenceBackstop, type TriageResult, type TriageDeps, type TriagedInsight, type TriageEventInput, type TriageVerdict } from './insights/triageInsights';
export { CADENCE_VOCAB } from './insights/schema';

export { parseCcStatement } from './ccStatement/parseCcStatement';
export { type CcLineItem, type CcStatementParse, CcStatementParseSchema } from './ccStatement/schema';
