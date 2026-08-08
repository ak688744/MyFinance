export const AI_TASKS = {
  categorization: {
    label: 'Expense Categorization',
    description: 'Suggest categories for uncategorized transactions',
    // First-run convenience ONLY: pre-selects this dialect in the setup form when the
    // task has no ai_task_routes row yet. NOT a binding — the actual task→provider→model
    // routing lives entirely in the ai_task_routes DB table and is fully user-editable
    // from Settings. Changing this never re-routes an already-configured task.
    defaultDialect: 'gemini',
  },
  wealth_chat: {
    label: 'Wealth Chat Agent',
    description: 'The conversational wealth-manager agent (multi-step, tool-using)',
    defaultDialect: 'gemini',
  },
  expense_agent: {
    label: 'Expense Clarity Agent',
    description: 'The expense specialist: categorizes, disambiguates, and tags transactions',
    defaultDialect: 'gemini',
  },
  expense_insight_triage: {
    label: 'Expense Insight Triage',
    description: 'Evaluates rule-flagged expense insights: suppresses false alarms, routes to needs-input vs worth-knowing, suggests forecasting tags',
    defaultDialect: 'gemini',
  },
  cc_statement_parse: {
    label: 'Credit-Card Statement Parse',
    description: 'Extract itemized line items from an uploaded credit-card statement PDF',
    defaultDialect: 'gemini',
  },
} as const;

export type AiTaskId = keyof typeof AI_TASKS;

export function isAiTask(x: string): x is AiTaskId {
  return Object.prototype.hasOwnProperty.call(AI_TASKS, x);
}
