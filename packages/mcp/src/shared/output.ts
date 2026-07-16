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
