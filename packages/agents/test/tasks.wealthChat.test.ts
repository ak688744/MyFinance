import { describe, it, expect } from 'vitest';
import { AI_TASKS, isAiTask } from '../src/tasks';

describe('wealth_chat task', () => {
  it('is registered in AI_TASKS with a label + description', () => {
    expect(AI_TASKS.wealth_chat).toBeDefined();
    expect(typeof AI_TASKS.wealth_chat.label).toBe('string');
    expect(AI_TASKS.wealth_chat.label.length).toBeGreaterThan(0);
    expect(typeof AI_TASKS.wealth_chat.description).toBe('string');
  });

  it('is recognized by isAiTask', () => {
    expect(isAiTask('wealth_chat')).toBe(true);
  });
});
