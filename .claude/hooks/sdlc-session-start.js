#!/usr/bin/env node
// Minimal SessionStart trigger for the MyFinance Web tiered SDLC.
// Deterministically reminds every session to triage work before acting.
// The heavy procedure lives in the `myfinance-sdlc` skill and lazy-loads on invoke.

const message = [
  'MyFinance Web is a multi-layer build governed by docs/superpowers/MASTER_PLAN.md.',
  'Before any brainstorming, planning, or coding: invoke the `myfinance-sdlc` skill to',
  'classify this task into a tier (T1 full discipline / T2 light / T3 direct), then run',
  'the matching process. Touching core financial logic (XIRR, categorization, parsers,',
  'portfolio math) is always T1. When unsure, round up a tier.',
].join(' ');

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: message,
    },
  })
);
