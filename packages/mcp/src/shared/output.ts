export type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Success: compact JSON in a text block + typed echo in structuredContent. */
export function ok(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

/** Recoverable failure the agent should see and react to (D6 handler layer). */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Preview (dry-run) result for a gated write tool called without confirm:true.
 * Non-error; states what WOULD change and that nothing was mutated.
 */
export function preview(summary: string, impact: Record<string, unknown> = {}): ToolResult {
  const text = `${summary}\nNo changes made. Re-call with confirm: true to proceed.`;
  return {
    content: [{ type: 'text', text }],
    structuredContent: { preview: true, ...impact },
  };
}
