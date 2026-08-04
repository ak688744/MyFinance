import { describe, it, expect } from 'vitest';
import { AI_TASKS, isAiTask } from '../src/tasks';

describe('AI_TASKS registry', () => {
  it('includes categorization with label + description', () => {
    expect(AI_TASKS.categorization.label).toMatch(/categoriz/i);
    expect(AI_TASKS.categorization.description).toBeTruthy();
  });
  it('includes expense_agent', () => {
    expect(isAiTask('expense_agent')).toBe(true);
    expect(AI_TASKS.expense_agent.label).toBe('Expense Clarity Agent');
  });
  it('isAiTask guards unknown tasks', () => {
    expect(isAiTask('categorization')).toBe(true);
    expect(isAiTask('taxation')).toBe(false);
  });
});
