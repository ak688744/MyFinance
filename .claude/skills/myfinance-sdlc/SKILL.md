---
name: myfinance-sdlc
description: Use at the start of ANY work on the MyFinance Web re-platform — classifies the task into a tier (T1 full discipline / T2 light / T3 direct) and runs the matching process. Invoke before brainstorming, planning, or coding.
---

# MyFinance Web — Tiered SDLC

This project (re-platforming the local-first RN finance app into a Node/TS
backend + web UI + MCP server + Claude Agent SDK wealth-manager) is built across
many sessions by AI agents. **Durable memory lives in files, not chat.** Don't
pay full-process cost for small work — triage first, then run the matching tier.

## Step 0 — Hydrate (always)

1. Read `docs/superpowers/MASTER_PLAN.md` in full — it is project ground truth.
2. Call `mcp__project-memory__get_context` and search for relevant prior decisions.

## Step 1 — Classify the tier

Apply these rules in order; the first match wins:

- **Touches `core` financial logic** (XIRR, categorization, parsers, portfolio/NAV
  math)? → **T1**, regardless of size, **and re-validate against Groww.** This code
  regresses silently (see project-memory: XIRR convergence, AMFI matching).
- **New layer (L0–L4) or new architectural surface** (new package, new API contract,
  new agent)? → **T1**.
- **Scoped change, a few files, no new contracts?** → **T2**.
- **One obvious localized fix / copy change / tweak?** → **T3**.
- **When unsure, round up a tier.** Cheap insurance.

## Step 1b — Confirm the tier with the user (REQUIRED)

State the chosen tier, the rule that selected it, and what the matching process
will involve — then **ask the user to confirm or override before proceeding.**
Use the AskUserQuestion tool (or a direct question) offering the chosen tier plus
the adjacent tiers. Do not start brainstorming, planning, or coding until the user
confirms. This gate prevents silent under-tiering (e.g. running T2 on work that
actually touches `core`).

## Step 2 — Run the matching process

### T1 — Layer / substantial feature / any core-logic change (FULL DISCIPLINE)
1. **Brainstorm** → write a spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (use the brainstorming skill).
2. **Plan** → use the writing-plans skill to produce a verifiable implementation plan.
3. **Branch** `layer/<n>-name` (or `feat/<name>` for non-layer features).
4. **TDD** → tests first, then implementation. Non-negotiable: the suite is how we trust agent-written code.
5. **Subagent review** → dispatch a fresh code-reviewer agent to audit the diff against the spec before merge.
6. **PR + merge.**
7. **Close out** → update the §4 status table in `MASTER_PLAN.md`, save decisions to project-memory, link the new spec.
- **One layer per session** — protects context. If the work is a full layer, do only that layer this session.

### T2 — Small feature / enhancement (LIGHT)
1. Short **inline plan** (a few steps in chat — no formal spec doc).
2. Implement.
3. **Tests for the new logic** (don't skip tests, just skip the ceremony).
4. **Self-review** the diff. Subagent review only if the change is risky.
5. Note anything significant in project-memory.

### T3 — Bug fix / tweak (DIRECT)
1. Make the fix.
2. **Verify** — run existing tests; add a regression test if logic changed.
3. Done. No spec, no formal plan.

## Step 3 — Close out (always)
- If state changed, update `MASTER_PLAN.md` §4 (layer status) and §8 (open items).
- Save decisions/findings to project-memory (`mcp__project-memory__memory_save`).
- Call `mcp__project-memory__session_summary` before the final response.

## Hard rules
- The **spec is the contract** (T1). Implementation drift from the spec is a bug.
- `core` is **frozen-ish**: any change requires Groww re-validation, even tiny ones.
- `MASTER_PLAN.md` is **read-first, update-last** every session.
