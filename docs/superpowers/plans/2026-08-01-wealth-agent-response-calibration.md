# Wealth Agent — Response Calibration + Interactive Clarifying Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wealth agent calibrate response depth to the question (prompt-only) and let it ask the user single-select clarifying questions mid-conversation via a new `ask_user` tool surfaced as an SSE `question` event and rendered as option chips in the web UI.

**Architecture:** Two features on one branch. (1) Verbosity calibration is a prompt rewrite of `WEALTH_INSTRUCTIONS` — not unit-testable, verified empirically. (2) Interactive questions add a *local* Mastra `ask_user` tool (defined in `agent-harness`, merged with the MCP toolset), a new `HarnessEvent`/`AgentEvent` variant `{type:'question',…}`, mapping in `streamEvents.mapChunk`, an SSE frame in the api agent route, and web rendering via a new `QuestionChips` component. No changes to `packages/core`, `packages/mcp`, or any finance tool.

**Tech Stack:** TypeScript, Node 22, Mastra (`@mastra/core` 1.51, `createTool` from `@mastra/core/tools`), Zod 3, Fastify (SSE via `reply.hijack()`), React 19 + Vite + Vitest + Testing Library.

## Global Constraints

- **Node 22** for all commands: prefix with `source ~/.nvm/nvm.sh && nvm use 22`.
- **pnpm** (only if installing deps — none required here): `node ~/.cache/node/corepack/v1/pnpm/10.4.1/dist/pnpm.cjs <cmd> --config.manage-package-manager-versions=false`.
- **Build/test via local bins:** `node_modules/.bin/vitest run` and `node_modules/.bin/tsc --build`. Never compile the monorepo to JS — it runs via `tsx`.
- **tsc build order:** core → agents → agent-harness → api → web (composite project refs; build a dependency before its dependent).
- **Seam invariant:** no `drizzle` / `better-sqlite3` import anywhere in `packages/agent-harness/src`.
- **Groww golden-master:** untouched (no `packages/core` change). Do not modify core.
- **`ask_user` lives in `agent-harness`, NOT `packages/mcp`** — it is conversation-control, not a finance tool.
- **SSE event contract (new):** `{ type: 'question', question: string, options: { label: string }[] }`.
- **Tool-call chunk shape (confirmed from `@mastra/core` dist types):** a `fullStream` `tool-call` chunk is `{ type: 'tool-call', payload: { toolCallId, toolName, args } }` where `payload.args` is the parsed tool-input object. `ask_user` args are `{ question, options }`.
- **No second usage row:** a `question` event must not add a usage row — accounting stays one row per turn (unchanged `runChat` logic).
- **Do NOT introduce rigid length caps or a verbosity toggle** (rejected in brainstorm — the agent must exercise judgment).
- Commit after each task. Push/PR via `gh auth switch --user ak688744`.

---

### Task 1: Verbosity calibration — rewrite `WEALTH_INSTRUCTIONS`

Prompt-only behaviour change. Not unit-testable; verified empirically in Task 7. This task keeps the existing structural test green (persona non-empty + mentions "profile") and adds one guard for the new `ask_user` guidance so the instruction text stays coupled to the tool.

**Files:**
- Modify: `packages/agent-harness/src/wealthAgent.ts` (the `WEALTH_INSTRUCTIONS` template string)
- Test: `packages/agent-harness/test/wealthAgent.test.ts` (extend existing structural test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `WEALTH_INSTRUCTIONS` (unchanged export name/type — a `string`). Its new content instructs calibration + when to call `ask_user`.

- [ ] **Step 1: Write the failing test** — add these two assertions inside the existing `describe('wealth agent', …)` block in `packages/agent-harness/test/wealthAgent.test.ts`, after the existing `'has a non-empty persona…'` test:

```ts
  it('instructs calibrated verbosity and clarifying questions', () => {
    const lower = WEALTH_INSTRUCTIONS.toLowerCase();
    // Calibration: matches depth to the question (few-shot / rules present).
    expect(lower).toContain('ask_user');
    // Anti-pattern guidance present (no mega-report-every-turn).
    expect(lower).toMatch(/1[–-]3 sentences|1 to 3 sentences|one to three sentences/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/wealthAgent.test.ts`
Expected: FAIL — current instructions contain neither `ask_user` nor the "1–3 sentences" phrasing.

- [ ] **Step 3: Rewrite `WEALTH_INSTRUCTIONS`** in `packages/agent-harness/src/wealthAgent.ts`. Replace the entire `export const WEALTH_INSTRUCTIONS = \`…\`;` block with:

```ts
export const WEALTH_INSTRUCTIONS = `You are the user's personal wealth manager.

Ground every answer in TWO sources: (1) the user's saved PROFILE (working memory,
injected each turn) and (2) LIVE data you fetch with the finance tools. Never invent
numbers — call a tool (net worth, portfolio, expenses, loans, transactions) to get them.

CALIBRATE YOUR RESPONSE TO THE QUESTION — this is the most important rule. Behave like a
sharp human advisor, not a report generator. Read what is actually being asked and match
your depth to it:
- A quick / factual question ("what's my net worth?", "how much did I spend last month?")
  → answer in 1–3 sentences with the headline number in bold. Nothing else.
- A genuine "analyse / advise / plan" question ("what should I do with extra savings?")
  → lead with your conclusion in one or two sentences, then give ONLY the few facts and
  numbers that actually drove it. A focused answer of a few short paragraphs. At most ONE
  small table, and only if it truly aids the point.
- Reserve long, multi-section breakdowns and multiple tables for when the user EXPLICITLY
  asks for a full/detailed breakdown, a complete plan, or "show me everything".

DON'T (anti-patterns — these make answers worse):
- No "here's everything I could think of" dumps. Answer the question asked; stop there.
- Do NOT restate the same number in prose AND a table. Say it once.
- No emoji section headers (🚀 1️⃣ 2️⃣), no multi-phase roadmaps, no "COMPREHENSIVE …"
  mega-reports unless the user explicitly asked for that.
- Do NOT narrate your process. No "Let me pull…", "Perfect!", "Great question!". Work
  quietly with tools, then answer.
- Stop as soon as the question is answered. Brevity is a feature.

Examples of the calibration you should imitate:

  User: What's my net worth right now?
  You: **₹95.9L** — ₹1.08Cr in assets against ₹12.3L of liabilities.

  User: What should I do with an extra ₹50k a month?
  You: **Put most of it into your equity SIPs and top up your emergency buffer first.**
  Your equity allocation is a bit light for a 15-year horizon and you're carrying only
  ~2 months of expenses in cash. I'd split it ~₹35k to your existing equity funds and
  ₹15k to a liquid fund until the buffer reaches ~6 months, then shift that ₹15k to equity too.

  User: Should I prepay my home loan or invest instead?
  You: I need one thing to answer well — call ask_user rather than guessing which matters
  more to you (guaranteed interest saved vs. expected market return).

WHEN YOU ARE MISSING A FACT needed to answer well (e.g. the user's risk appetite, which
goal matters most, a figure they haven't told you and no tool can fetch), call the
'ask_user' tool with a crisp question and 2–4 concise options, then STOP. Do not also
stream a long speculative answer covering every branch in the same turn — ask, and wait
for the reply. Only ask when it genuinely changes your answer; if a tool can get the fact,
use the tool instead.

MEMORY: When the user tells you something durable about themselves (income, a goal like
"retire by 55", a preference, a future plan), save it to your working-memory profile AND
tell the user what you saved (e.g. "Noted — you're targeting retirement by 55."). Keep the
profile current and correct; if the user corrects a fact, update it.

FORMATTING: reply in GitHub-flavoured Markdown. Use tables only when comparing rows of
data; prefer short prose + tight bullets otherwise. Bold the headline numbers.

WRITES & SAFETY: You have write tools (add/update/delete transactions, categories, rules,
accounts, assets, liabilities). Before any mutation, state plainly what you're about to
change. Destructive tools (delete_*, recategorize_all) require a confirmation step: they
return a PREVIEW first; relay that preview to the user and only call again with confirm:true
after the user agrees. Never confirm a destructive change on the user's behalf without asking.`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/wealthAgent.test.ts`
Expected: PASS — both the pre-existing structural test and the new calibration test.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-harness/src/wealthAgent.ts packages/agent-harness/test/wealthAgent.test.ts
git commit -m "feat(l4): calibrate wealth-agent verbosity + guide ask_user use"
```

---

### Task 2: `ask_user` local tool (`askUserTool.ts`)

A local Mastra tool the agent calls to ask the user a single-select question. It performs no side effect — `execute` echoes its validated args so the framework has a tool-result to close the tool-call. The harness treats the call as end-of-turn (mapping happens in Task 3).

**Files:**
- Create: `packages/agent-harness/src/askUserTool.ts`
- Test: `packages/agent-harness/test/askUserTool.test.ts`

**Interfaces:**
- Consumes: `createTool` from `@mastra/core/tools`, `z` from `zod`.
- Produces:
  - `ASK_USER_TOOL_NAME = 'ask_user'` (string constant).
  - `buildAskUserTool(): Record<string, unknown>` — returns `{ ask_user: <Tool> }`, shaped to merge directly into the MCP toolset object passed to `buildWealthAgent`.
  - The tool's `inputSchema` is `z.object({ question: z.string(), options: z.array(z.object({ label: z.string() })).default([]) })`.
  - The tool's `execute` returns `{ question, options }` (its validated input).

- [ ] **Step 1: Write the failing test** — create `packages/agent-harness/test/askUserTool.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/askUserTool.test.ts`
Expected: FAIL — module `../src/askUserTool` does not exist.

- [ ] **Step 3: Write the implementation** — create `packages/agent-harness/src/askUserTool.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/askUserTool.test.ts`
Expected: PASS — all four tests.

> Note on `execute` signature: `@mastra/core` `createTool` passes the validated input as the first argument (per the dist docstrings, e.g. `execute: async (inputData) => …`). If the installed version instead wraps input in a context object, adjust `execute` to `async ({ context }) => context` and update the test's `tool.execute(input)` call to `tool.execute({ context: input })`. Verify against the actual runtime in Step 4; the test is the arbiter.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-harness/src/askUserTool.ts packages/agent-harness/test/askUserTool.test.ts
git commit -m "feat(l4): add local ask_user clarifying-question tool"
```

---

### Task 3: Map `ask_user` tool-call to a `question` event in `streamEvents`

Extend `HarnessEvent` with a `question` variant and teach `mapChunk` to route an `ask_user` tool-call to it (parsing `payload.args`), while every other tool-call still maps to a `step`.

**Files:**
- Modify: `packages/agent-harness/src/streamEvents.ts`
- Test: `packages/agent-harness/test/streamEvents.test.ts` (extend)

**Interfaces:**
- Consumes: `ASK_USER_TOOL_NAME` from `./askUserTool`; the tool-call chunk shape `{ type: 'tool-call', payload: { toolName, args } }` where `args` is `{ question?, options? }`.
- Produces: `HarnessEvent` now includes `{ type: 'question'; question: string; options: { label: string }[] }`.

- [ ] **Step 1: Write the failing tests** — add to `packages/agent-harness/test/streamEvents.test.ts`. First extend the import line, then add a new `describe` block:

```ts
// (top of file) add ASK_USER import for building the chunk name:
import { ASK_USER_TOOL_NAME } from '../src/askUserTool';
```

```ts
describe('mapChunk — ask_user question events', () => {
  it('maps an ask_user tool-call to a question event (from payload.args)', () => {
    const chunk = {
      type: 'tool-call',
      payload: {
        toolCallId: 'q1',
        toolName: ASK_USER_TOOL_NAME,
        args: { question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] },
      },
    };
    expect(mapChunk(chunk)).toEqual({
      type: 'question',
      question: 'Prepay or invest?',
      options: [{ label: 'Prepay' }, { label: 'Invest' }],
    });
  });

  it('a finance tool-call still maps to a step (not a question)', () => {
    const chunk = { type: 'tool-call', payload: { toolName: 'finance_get_networth_overview', args: {} } };
    expect(mapChunk(chunk)).toEqual({ type: 'step', label: 'Checking net worth' });
  });

  it('ask_user with no options yields a question event with options: []', () => {
    const chunk = { type: 'tool-call', payload: { toolName: ASK_USER_TOOL_NAME, args: { question: 'How much risk?' } } };
    expect(mapChunk(chunk)).toEqual({ type: 'question', question: 'How much risk?', options: [] });
  });

  it('ask_user with no usable question is ignored (null)', () => {
    const chunk = { type: 'tool-call', payload: { toolName: ASK_USER_TOOL_NAME, args: {} } };
    expect(mapChunk(chunk)).toBeNull();
  });

  it('drops malformed option entries, keeping only { label } strings', () => {
    const chunk = {
      type: 'tool-call',
      payload: {
        toolName: ASK_USER_TOOL_NAME,
        args: { question: 'Pick one', options: [{ label: 'A' }, { nope: 1 }, { label: 42 }, 'x'] },
      },
    };
    expect(mapChunk(chunk)).toEqual({ type: 'question', question: 'Pick one', options: [{ label: 'A' }] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/streamEvents.test.ts`
Expected: FAIL — `ask_user` tool-calls currently map to a `step`, and `HarnessEvent` has no `question` variant.

- [ ] **Step 3: Implement** — edit `packages/agent-harness/src/streamEvents.ts`:

Add the import at the top (after the header comment):
```ts
import { ASK_USER_TOOL_NAME } from './askUserTool';
```

Extend the `HarnessEvent` union:
```ts
export type HarnessEvent =
  | { type: 'text'; text: string }
  | { type: 'step'; label: string }
  | { type: 'question'; question: string; options: { label: string }[] };
```

Add a private helper above `mapChunk`:
```ts
/** Extract a clean `{ question, options[] }` from an ask_user tool-call's args. */
function toQuestionEvent(args: unknown): HarnessEvent | null {
  const a = (args ?? {}) as { question?: unknown; options?: unknown };
  const question = typeof a.question === 'string' ? a.question.trim() : '';
  if (!question) return null; // no usable question → ignore the chunk
  const rawOptions = Array.isArray(a.options) ? a.options : [];
  const options = rawOptions
    .filter((o): o is { label: string } =>
      !!o && typeof o === 'object' && typeof (o as { label?: unknown }).label === 'string')
    .map((o) => ({ label: o.label }));
  return { type: 'question', question, options };
}
```

Replace the `tool-call` branch of `mapChunk` with:
```ts
  if (c.type === 'tool-call') {
    const toolName = c.payload?.toolName ?? '';
    if (toolName === ASK_USER_TOOL_NAME) {
      return toQuestionEvent((c.payload as { args?: unknown })?.args);
    }
    return { type: 'step', label: toFriendlyToolLabel(toolName) };
  }
```

Also widen the local `c` cast so `args` is visible — change the cast line at the top of `mapChunk` to:
```ts
  const c = chunk as { type?: string; payload?: { text?: string; toolName?: string; args?: unknown } };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/streamEvents.test.ts`
Expected: PASS — new `question` tests plus all pre-existing `mapChunk`/`toFriendlyToolLabel` tests (the original "whole tool-using turn" test still passes because the finance tool-call still maps to a step).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-harness/src/streamEvents.ts packages/agent-harness/test/streamEvents.test.ts
git commit -m "feat(l4): map ask_user tool-call to a question stream event"
```

---

### Task 4: Wire `ask_user` into the toolset + export the new surface

Merge the `ask_user` tool into the toolset passed to `buildWealthAgent`, and export `buildAskUserTool` + `ASK_USER_TOOL_NAME` + the updated `HarnessEvent` from the package index. The `events` generator already yields whatever `mapChunk` returns, so `question` events flow through with no change to the generator body; the `textStream` derived view already filters to `type === 'text'`, so it silently ignores `question` events (correct).

**Files:**
- Modify: `packages/agent-harness/src/runChat.ts`
- Modify: `packages/agent-harness/src/index.ts`
- Test: `packages/agent-harness/test/runChat.test.ts` (extend — assert a `question` event flows through `events`)

**Interfaces:**
- Consumes: `buildAskUserTool` from `./askUserTool`; existing `getFinanceTools`.
- Produces: no signature change to `runChat`/`ChatResult`; `events` now may yield `{type:'question',…}`. New index exports: `buildAskUserTool`, `ASK_USER_TOOL_NAME`.

- [ ] **Step 1: Write the failing test** — add to `packages/agent-harness/test/runChat.test.ts`. Add a mock model whose stream emits an `ask_user` tool-call, and assert the `events` stream surfaces a `question` event. Append inside the existing `describe('makeWealthHarness.runChat', …)`:

```ts
  it('surfaces an ask_user tool-call as a question event through the events stream', async () => {
    // A model whose fullStream contains an ask_user tool-call.
    const askModel = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: '' }],
        finishReason: 'tool-calls',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      } as any),
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            {
              type: 'tool-call',
              toolCallId: 'q1',
              toolName: 'ask_user',
              input: JSON.stringify({ question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] }),
            },
            { type: 'finish', finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
          ],
        }),
      }),
    } as any);

    const h = makeWealthHarness({ ...deps(), makeModel: () => askModel } as HarnessDeps);
    const r = await h.runChat({ message: 'should I prepay?', threadId: 'thread-q' });
    const collected: any[] = [];
    for await (const ev of r.events) collected.push(ev);
    await r.done;
    const q = collected.find((e) => e.type === 'question');
    expect(q).toBeTruthy();
    expect(q.question).toBe('Prepay or invest?');
    expect(q.options).toEqual([{ label: 'Prepay' }, { label: 'Invest' }]);
  }, 30000);
```

> If the running Mastra version surfaces the tool-call chunk under `payload.args` rather than mapping the mock's `input` string automatically, this test still passes because `mapChunk` reads `payload.args`; if the mock exposes the raw `input` string differently, adjust the chunk to `{ type:'tool-call', payload:{ toolName:'ask_user', args:{…} } }` — but prefer letting Mastra normalize it. The `runChat` `events` generator is unchanged; this test proves the tool is registered and the mapping fires end-to-end.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/runChat.test.ts`
Expected: FAIL — `ask_user` is not in the toolset, so the agent cannot produce that tool-call / it is not registered; the `question` event is absent.

- [ ] **Step 3: Implement** — edit `packages/agent-harness/src/runChat.ts`:

Add the import (with the other local imports near the top):
```ts
import { buildAskUserTool } from './askUserTool';
```

In `runChat`, merge the local tool into the toolset right after `getFinanceTools`:
```ts
      const mcpClient = buildFinanceMcpClient({ dbPath: deps.dbPath });
      const financeTools = await getFinanceTools(mcpClient);
      const tools = { ...financeTools, ...buildAskUserTool() };
```
(Replace the existing `const tools = await getFinanceTools(mcpClient);` line.)

Then edit `packages/agent-harness/src/index.ts` — add:
```ts
export { buildAskUserTool, ASK_USER_TOOL_NAME } from './askUserTool';
```
(The existing `export type { HarnessEvent } from './streamEvents';` already re-exports the widened union — no change needed there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run`
Expected: PASS — the full agent-harness suite (existing + new `question` test).

- [ ] **Step 5: Typecheck the package**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/tsc --build`
Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add packages/agent-harness/src/runChat.ts packages/agent-harness/src/index.ts packages/agent-harness/test/runChat.test.ts
git commit -m "feat(l4): register ask_user tool + export ask_user surface"
```

---

### Task 5: Emit an SSE `question` frame from the api agent route

The route already iterates `chat.events`; add a branch for `ev.type === 'question'` that writes a `{type:'question',…}` SSE frame. No usage-row change (that lives in `runChat`).

**Files:**
- Modify: `packages/api/src/routes/agent.ts`
- Test: `packages/api/test/agentChat.test.ts` (extend `fakeHarness` + add a test)

**Interfaces:**
- Consumes: `chat.events` yielding a `{type:'question',question,options}` event.
- Produces: SSE frame `data: {"type":"question","question":…,"options":[…]}`.

- [ ] **Step 1: Write the failing test** — in `packages/api/test/agentChat.test.ts`, extend `fakeHarness('ok')`'s `events()` generator to also yield a question, and add a test. Change the `events()` generator inside `fakeHarness` to:

```ts
      async function* events() {
        yield { type: 'text', text: 'Hello ' };
        yield { type: 'step', label: 'Checking net worth' };
        yield { type: 'question', question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] };
        yield { type: 'text', text: 'world' };
      }
```

Add this test inside `describe('POST /agent/chat', …)`:

```ts
  it('emits a question SSE frame with option labels', async () => {
    app = await buildServer({ dbPath: ':memory:', harness: fakeHarness('ok') as any });
    const res = await app.inject({
      method: 'POST', url: '/agent/chat',
      payload: { message: 'should I prepay?' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"type":"question"');
    expect(res.body).toContain('Prepay or invest?');
    expect(res.body).toContain('Prepay');
    expect(res.body).toContain('Invest');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/vitest run test/agentChat.test.ts`
Expected: FAIL — the route drops `question` events (only handles `text`/`step`), so `"type":"question"` is absent from the body.

- [ ] **Step 3: Implement** — in `packages/api/src/routes/agent.ts`, add a branch inside the `for await (const ev of chat.events)` loop, after the `step` branch:

```ts
        } else if (ev.type === 'step') {
          reply.raw.write(sse({ type: 'step', label: ev.label }));
        } else if (ev.type === 'question') {
          reply.raw.write(sse({ type: 'question', question: ev.question, options: ev.options }));
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/vitest run test/agentChat.test.ts`
Expected: PASS — new question-frame test plus the existing three tests.

- [ ] **Step 5: Typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/tsc --build`
Expected: clean. (If TS narrows `ev` and complains that `question`/`options` don't exist, it means `@myfinance/agent-harness`'s `HarnessEvent` widening from Task 3/4 isn't picked up — rebuild agent-harness first: `cd packages/agent-harness && node_modules/.bin/tsc --build`, then re-run.)

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/agent.ts packages/api/test/agentChat.test.ts
git commit -m "feat(l4): emit SSE question frame from agent route"
```

---

### Task 6: Web — parse `question` events, attach to message, render `QuestionChips`

Add the `question` variant to the web `AgentEvent`, store `{question,options}` on the current assistant message in `useAgentChat`, create `QuestionChips`, and render it under an assistant bubble in `AssistantPage`. Clicking a chip calls `send(label)`; the free-text input stays active.

**Files:**
- Modify: `apps/web/src/lib/apiStream.ts`
- Modify: `apps/web/src/features/assistant/useAgentChat.ts`
- Create: `apps/web/src/features/assistant/QuestionChips.tsx`
- Modify: `apps/web/src/features/assistant/AssistantPage.tsx`
- Test: `apps/web/test/useAgentChat.test.ts` (extend), `apps/web/test/AssistantPage.test.tsx` (extend)

**Interfaces:**
- Consumes: SSE `{type:'question',question,options}` frame from Task 5.
- Produces:
  - `AgentEvent` gains `{ type: 'question'; question: string; options: { label: string }[] }`.
  - `ChatMessage` gains optional `question?: { question: string; options: { label: string }[] }`.
  - `QuestionChips({ options, onSelect, disabled })` — renders chips; `onSelect(label)`.

- [ ] **Step 1: Write the failing hook test** — add to `apps/web/test/useAgentChat.test.ts`:

```ts
  it('attaches a question (with options) to the assistant message', async () => {
    setStream(async function* () {
      yield { type: 'start', threadId: 't1' };
      yield { type: 'question', question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] };
      yield { type: 'done', threadId: 't1', usage: { inputTokens: 3, outputTokens: 1 } };
    });
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.send('should I prepay?'); });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.question).toEqual({
      question: 'Prepay or invest?',
      options: [{ label: 'Prepay' }, { label: 'Invest' }],
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/useAgentChat.test.ts`
Expected: FAIL — `question` events are ignored; `last.question` is undefined.

- [ ] **Step 3: Implement `apiStream` + `useAgentChat`**

In `apps/web/src/lib/apiStream.ts`, extend the `AgentEvent` union:
```ts
export type AgentEvent =
  | { type: 'start'; threadId: string }
  | { type: 'token'; text: string }
  | { type: 'step'; label: string }
  | { type: 'question'; question: string; options: { label: string }[] }
  | { type: 'done'; threadId: string; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; message: string };
```
(No parser change needed — `parseSseChunk` already `JSON.parse`s any frame into `AgentEvent`.)

In `apps/web/src/features/assistant/useAgentChat.ts`, extend `ChatMessage`:
```ts
export type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  steps?: string[];
  question?: { question: string; options: { label: string }[] };
};
```
Add a branch in the `for await` loop in `send`, after the `step` branch and before the `done` branch:
```ts
        } else if (ev.type === 'question') {
          setMessages((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, role: 'assistant', question: { question: ev.question, options: ev.options } };
            }
            return next;
          });
```
(Persistence is unchanged — `question` rides along in the message object saved by the `done` branch's `save(m, …)`, exactly like `steps`.)

- [ ] **Step 4: Run hook test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/useAgentChat.test.ts`
Expected: PASS — new question test plus all existing hook tests.

- [ ] **Step 5: Write the failing `AssistantPage` test** — add to `apps/web/test/AssistantPage.test.tsx`:

```ts
  it('renders question chips for an assistant message carrying a question', () => {
    const send = vi.fn();
    hookState.value = {
      ...hookState.value,
      send,
      messages: [
        { role: 'user', text: 'should I prepay?' },
        {
          role: 'assistant',
          text: '',
          question: { question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] },
        },
      ],
    };
    render(<AssistantPage />);
    expect(screen.getByText('Prepay or invest?')).toBeTruthy();
    const chip = screen.getByRole('button', { name: 'Prepay' });
    chip.click();
    expect(send).toHaveBeenCalledWith('Prepay');
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/AssistantPage.test.tsx`
Expected: FAIL — no chips rendered; `getByRole('button', { name: 'Prepay' })` throws.

- [ ] **Step 7: Create `QuestionChips.tsx`** — `apps/web/src/features/assistant/QuestionChips.tsx`:

```tsx
/**
 * Single-select clarifying-question chips rendered under an assistant bubble.
 * Clicking a chip sends that label as the next user message. Free-text reply is
 * always still possible via the page's input — these chips are a shortcut, not a gate.
 */
export function QuestionChips({
  question,
  options,
  onSelect,
  disabled,
}: {
  question: string;
  options: { label: string }[];
  onSelect: (label: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-1">
      <div className="text-sm text-ink mb-2">{question}</div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(o.label)}
              className="text-xs px-3 py-1.5 rounded-full border border-ai/30 bg-ai/5 text-ai hover:bg-ai/10 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Render `QuestionChips` in `AssistantPage`**

In `apps/web/src/features/assistant/AssistantPage.tsx`, add the import:
```tsx
import { QuestionChips } from './QuestionChips';
```
Inside the assistant-bubble JSX, after the `Markdown`/thinking block (right before the closing `</div>` of `bubbleClass`), add:
```tsx
                {m.role === 'assistant' && !isError && m.question && (
                  <QuestionChips
                    question={m.question.question}
                    options={m.question.options}
                    onSelect={(label) => void onSend(label)}
                    disabled={isStreaming}
                  />
                )}
```
This sits inside the `<div className={bubbleClass}>…</div>` block, after the existing conditional that renders `m.text`/thinking. Placing it there keeps the free-text input (below the messages list) fully active.

- [ ] **Step 9: Run the AssistantPage + hook tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/AssistantPage.test.tsx test/useAgentChat.test.ts`
Expected: PASS — both new tests plus all existing tests.

- [ ] **Step 10: Typecheck web**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/tsc --build`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/apiStream.ts apps/web/src/features/assistant/useAgentChat.ts apps/web/src/features/assistant/QuestionChips.tsx apps/web/src/features/assistant/AssistantPage.tsx apps/web/test/useAgentChat.test.ts apps/web/test/AssistantPage.test.tsx
git commit -m "feat(l4): render ask_user question chips in web assistant"
```

---

### Task 7: Full-suite gate + live calibration verification

Prove the whole graph is green and typechecks, and verify the two behavioural goals empirically against `demo.db` (calibration is not unit-testable).

**Files:** none (verification only).

- [ ] **Step 1: Build the whole graph (dependency order)**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd /Users/vkhandelwal/Documents/MyFinance
for p in packages/core packages/agents packages/agent-harness packages/api apps/web; do
  ( cd "$p" && node_modules/.bin/tsc --build ) || { echo "TSC FAIL in $p"; break; }
done
```
Expected: clean across all packages.

- [ ] **Step 2: Run the full suites for the three touched packages**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd /Users/vkhandelwal/Documents/MyFinance
( cd packages/agent-harness && node_modules/.bin/vitest run ) && \
( cd packages/api && node_modules/.bin/vitest run ) && \
( cd apps/web && node_modules/.bin/vitest run )
```
Expected: all green. (agent-harness gains askUserTool + streamEvents question + runChat question tests; api gains the question-frame test; web gains the hook + AssistantPage question tests.)

- [ ] **Step 3: Confirm the Groww golden-master is untouched + seam invariant holds**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd /Users/vkhandelwal/Documents/MyFinance
( cd packages/core && node_modules/.bin/vitest run test/golden ) ; \
echo "--- seam check (expect no matches) ---" ; \
grep -rn "drizzle\|better-sqlite3" packages/agent-harness/src || echo "SEAM CLEAN"
```
Expected: Groww 6/6 pass (core untouched); seam check prints "SEAM CLEAN".

- [ ] **Step 4: Live calibration + ask_user verification against `demo.db`**

Adapt the existing `packages/agent-harness/repro-multiturn.mts` (or a small one-off `tsx` script) to run these prompts against `demo.db` with a stable model (haiku via Bedrock — reliable per project notes), logging each reply's character length:
- `"What is my current net worth breakdown?"` (quick → expect a short answer, not a mega-report)
- `"What do you suggest for extra investments?"` (open-ended advisory → expect conclusion-first, ≤1 table, materially shorter than the prior 14k–19k char baseline)
- `"Should I prepay my home loan or invest instead?"` (fact-missing → expect an `ask_user`/`question` event rather than a long two-branch essay)

Run (template — mirrors the saved "Live verify verbosity" script):
```bash
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1; cd /Users/vkhandelwal/Documents/MyFinance/packages/agent-harness; MYFINANCE_DB=/Users/vkhandelwal/Documents/MyFinance/demo.db AWS_REGION=us-east-1 node_modules/.bin/tsx repro-multiturn.mts 2>&1 | tail -60
```
Expected: (a) the two answers are materially shorter and conclusion-first vs the 14k–19k baseline; (b) the prepay/invest prompt produces a `question` event with options. Record the observed char counts in the PR description and the close-out memory. If calibration is weak, iterate on the Task 1 prompt wording (few-shot examples are the primary lever) and re-run — do NOT add a length cap.

- [ ] **Step 5: Commit any verification artifacts (if a repro script was added/changed)**

```bash
git add -A
git commit -m "chore(l4): live calibration + ask_user verification against demo.db" || echo "nothing to commit"
```

---

## Post-plan: review, PR, close-out (per myfinance-sdlc T1)

After Task 7 passes: dispatch a fresh `feature-dev:code-reviewer` subagent to audit the diff against this plan and the spec; address findings; push (`gh auth switch --user ak688744`) and open a PR into `main`; then update `MASTER_PLAN.md` §4/§8 and save a close-out decision + `session_summary` to project-memory.

## Self-Review notes

- **Spec coverage:** §3.1 calibration → Task 1; §3.2 `ask_user` tool → Task 2; §3.3 stream contract (mapChunk mapping, runChat pass-through, api SSE frame, web apiStream/useAgentChat/QuestionChips/AssistantPage) → Tasks 3–6; §5 error handling (no options → `options:[]`; unparseable → null; one usage row) → Task 3 tests + unchanged runChat accounting; §6 testing → Tasks 1–6 tests + Task 7 manual; §7 sequencing → task order matches. Covered.
- **Type consistency:** `HarnessEvent`/`AgentEvent` `question` variant shape `{ type:'question'; question:string; options:{label:string}[] }` is identical across streamEvents, apiStream, and the SSE frame; `ChatMessage.question` wraps `{question,options}`; `buildAskUserTool` key `ask_user` === `ASK_USER_TOOL_NAME` used by `mapChunk`. Consistent.
- **No placeholders:** every code step shows the exact edit; the one runtime unknown (`createTool` `execute` arg shape) has an explicit fallback with the test as arbiter (Task 2 note).
