import { describe, it, expect } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MockLanguageModelV4 } from 'ai/test';

describe('SPIKE: mock model drives a Mastra tool call', () => {
  it('fires a scripted tool call and reports usage', async () => {
    let toolRan = false;

    const ping = createTool({
      id: 'ping',
      description: 'returns pong',
      inputSchema: z.object({}),
      execute: async () => {
        toolRan = true;
        return { text: 'pong' };
      },
    });

    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        call += 1;
        if (call === 1) {
          return {
            content: [
              { type: 'tool-call', toolCallId: 't1', toolName: 'ping', input: '{}' },
            ],
            finishReason: 'tool-calls',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            warnings: [],
          } as any;
        }
        return {
          content: [{ type: 'text', text: 'pong done' }],
          finishReason: 'stop',
          usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
          warnings: [],
        } as any;
      },
    });

    const agent = new Agent({
      id: 'spike',
      name: 'Spike',
      instructions: 'Call the ping tool.',
      model: model as any,
      tools: { ping },
    });

    const result = await agent.generate('please ping');

    expect(toolRan).toBe(true);
    expect(result.text).toContain('pong');
    expect(result.usage).toBeDefined();
  });
});

describe('SPIKE: per-turn model+key resolution', () => {
  it('accepts an object-form model with a literal apiKey', () => {
    const agent = new Agent({
      id: 'spike-key',
      name: 'SpikeKey',
      instructions: 'x',
      model: { id: 'google/gemini-2.5-flash', apiKey: 'literal-test-key' } as any,
    });
    expect(agent).toBeDefined();
  });

  it('accepts a resolver-fn model (per-turn selection)', () => {
    const agent = new Agent({
      id: 'spike-resolver',
      name: 'SpikeResolver',
      instructions: 'x',
      model: (() => ({ id: 'google/gemini-2.5-flash', apiKey: 'k' })) as any,
    });
    expect(agent).toBeDefined();
  });
});
