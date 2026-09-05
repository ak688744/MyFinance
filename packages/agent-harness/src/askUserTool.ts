import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const ASK_USER_TOOL_NAME = 'ask_user';

const inputSchema = z.object({
  question: z.string(),
  options: z.array(z.object({ label: z.string() })).default([]),
});

/**
 * A conversation-control tool the wealth agent calls to ask the user a
 * single-select clarifying question. It has NO finance backend (hence it lives
 * here, not in packages/mcp). It performs no side effect: `execute` echoes its
 * validated args so the framework has a tool-result to close the tool-call. The
 * harness maps this specific tool-call to a `question` SSE event and ends the turn
 * (see streamEvents.mapChunk + runChat).
 */
export function buildAskUserTool(): Record<string, unknown> {
  const tool = createTool({
    id: ASK_USER_TOOL_NAME,
    description:
      'Ask the user a short clarifying question when you are missing a fact needed to ' +
      'answer well and no finance tool can fetch it. Provide a crisp question and 2–4 ' +
      'concise single-select options. Calling this ENDS your turn — do not also write a ' +
      'long answer in the same turn; wait for the user\'s reply. The user may also type a ' +
      'free-text answer instead of picking an option.',
    inputSchema,
    outputSchema: inputSchema,
    execute: async (input: z.infer<typeof inputSchema>) => input,
  });
  return { [ASK_USER_TOOL_NAME]: tool };
}
