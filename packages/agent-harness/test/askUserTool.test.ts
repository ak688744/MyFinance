import { describe, it, expect } from 'vitest';
import { buildAskUserTool, ASK_USER_TOOL_NAME } from '../src/askUserTool';

describe('askUserTool', () => {
  it('exposes a tool under the ask_user key', () => {
    const tools = buildAskUserTool();
    expect(ASK_USER_TOOL_NAME).toBe('ask_user');
    expect(tools).toHaveProperty('ask_user');
  });

  it('validates the input schema (question + options[])', () => {
    const tool = buildAskUserTool().ask_user as any;
    const parsed = tool.inputSchema.parse({
      question: 'Prepay or invest?',
      options: [{ label: 'Prepay' }, { label: 'Invest' }],
    });
    expect(parsed.question).toBe('Prepay or invest?');
    expect(parsed.options).toHaveLength(2);
  });

  it('defaults options to [] when omitted', () => {
    const tool = buildAskUserTool().ask_user as any;
    const parsed = tool.inputSchema.parse({ question: 'How much risk?' });
    expect(parsed.options).toEqual([]);
  });

  it('execute echoes its validated args (no side effect)', async () => {
    const tool = buildAskUserTool().ask_user as any;
    const input = { question: 'Which goal matters most?', options: [{ label: 'Retirement' }] };
    const out = await tool.execute(input);
    expect(out).toEqual(input);
  });
});
