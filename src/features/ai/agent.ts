import type { SQLiteDatabase } from 'expo-sqlite';

import type { AIProvider, Message, ToolDefinition } from './providers/types';
import { ALL_TOOLS, getToolByName } from './tools/registry';

const SYSTEM_PROMPT = `You are a helpful personal finance assistant. You have access to the user's bank transaction data and mutual fund investment data stored locally on their device.

When answering questions:
- Use the available tools to query actual data before responding
- You can call the same tool multiple times with different parameters to gather data for comparison (e.g., call get_spending_summary for each week separately, then compare the results yourself)
- Break down complex questions into multiple tool calls. For example, "compare weekly spending in March" means calling get_spending_summary 4-5 times for each week's date range, then analyzing the results
- Format currency amounts in Indian Rupees (₹) with Indian number formatting (lakhs, commas)
- Be concise but helpful — give the answer first, then brief context if useful
- If the user asks about spending, always check the actual data rather than guessing
- For investment questions, note that current NAV values require network access and may not be available in tool results
- Use YYYY-MM-DD format when calling tools with dates
- Today's date is ${new Date().toISOString().slice(0, 10)}

You help users understand their spending patterns, find specific transactions, analyze investment performance, and provide financial insights based on their actual data. You are capable of doing your own calculations, comparisons, and analysis on the data returned by tools — don't say you can't do something if you can fetch the raw data and compute it yourself.`;

export type AgentResponse = {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
};

const MAX_TOOL_ROUNDS = 10;

export async function runAgent(
  provider: AIProvider,
  db: SQLiteDatabase,
  userMessage: string
): Promise<AgentResponse> {
  const toolDefinitions: ToolDefinition[] = ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const messages: Message[] = [{ role: 'user', content: userMessage }];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await provider.chat({
      messages,
      tools: toolDefinitions,
      system: SYSTEM_PROMPT,
    });

    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    if (response.text && !response.toolCalls) {
      const cost = calculateCost(provider, totalInputTokens, totalOutputTokens);
      return {
        text: response.text,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          estimatedCost: cost,
        },
      };
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      // Add assistant's tool call as a message
      if (response.text) {
        messages.push({ role: 'assistant', content: response.text });
      } else {
        messages.push({
          role: 'assistant',
          content: `Calling tools: ${response.toolCalls.map((tc) => tc.name).join(', ')}`,
        });
      }

      // Execute each tool and add results
      for (const toolCall of response.toolCalls) {
        const tool = getToolByName(toolCall.name);
        let result: string;

        if (tool) {
          try {
            result = await tool.execute(db, toolCall.input);
          } catch (error) {
            result = JSON.stringify({
              error: error instanceof Error ? error.message : 'Tool execution failed',
            });
          }
        } else {
          result = JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
        }

        messages.push({
          role: 'tool',
          content: result,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });
      }
    } else {
      // No text, no tool calls — unexpected
      const cost = calculateCost(provider, totalInputTokens, totalOutputTokens);
      return {
        text: response.text ?? 'I was unable to generate a response.',
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          estimatedCost: cost,
        },
      };
    }
  }

  // Exceeded max rounds
  const cost = calculateCost(provider, totalInputTokens, totalOutputTokens);
  return {
    text: 'I reached the maximum number of data lookups for this query. Here is what I found so far based on the data available.',
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedCost: cost,
    },
  };
}

function calculateCost(
  provider: AIProvider,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = provider.getCostPer1kTokens();
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}
