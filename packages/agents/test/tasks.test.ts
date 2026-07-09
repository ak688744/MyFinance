import { describe, it, expect } from 'vitest';
import { AI_TASKS, isAiTask } from '../src/tasks';

describe('AI_TASKS registry', () => {
  it('includes categorization with label + description', () => {
    expect(AI_TASKS.categorization.label).toMatch(/categoriz/i);
    expect(AI_TASKS.categorization.description).toBeTruthy();
  });
  it('isAiTask guards unknown tasks', () => {
    expect(isAiTask('categorization')).toBe(true);
    expect(isAiTask('taxation')).toBe(false);
  });
});
