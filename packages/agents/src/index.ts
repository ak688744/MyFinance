export const AGENTS_VERSION = '0.0.0';

export { resolveProvider } from './llm/index';
export {
  LlmError, type LlmConfig, type LlmDialect, type LlmProvider, type LlmUsage, type LlmErrorKind,
} from './llm/types';
export { categorizeWithAI, type CategorizeResult, type CategorizeDeps } from './categorize/aiCategorize';
export { type AiSuggestion } from './categorize/schema';
export { type TxnForPrompt, type CategoryForPrompt } from './categorize/prompt';
