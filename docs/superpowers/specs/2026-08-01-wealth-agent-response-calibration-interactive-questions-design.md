# Wealth Agent — Response Calibration + Interactive Clarifying Questions

**Date:** 2026-08-01
**Tier:** T1 (new agent capability + new stream contract). **No core financial logic touched → no Groww re-validation.**
**Layer:** L4 (wealth agent UX), builds on the merged L4.0 harness.
**Status:** Design — approved in brainstorm, pending spec review.

## 1. Problem

Analysis of the user's real last thread (`thread-20260730185907887-5`, 13 messages) shows every assistant reply is **14,000–19,000 characters**: multi-section reports with emoji headers (`🚀 COMPREHENSIVE…`, `1️⃣ 2️⃣`), 6+ tables, and multi-phase roadmaps — regardless of how focused the question was. Two root causes:

1. **No response calibration.** The agent does not scale depth to the question. Open-ended advisory asks ("what do you suggest for extra investments") trigger maximal dumps; even the current "be concise" instructions don't hold because they *describe* conciseness without giving the model a *pattern* to imitate against its default report-writing instinct.
2. **No way to ask the user for missing info.** When the agent lacks a fact (e.g. current age, which goal matters), it guesses and over-explains to cover every branch, instead of asking a quick clarifying question.

The prior shipped work (markdown rendering, step-collapse, answer-first instructions) helped *focused* questions (verified: a "spend last month" reply dropped from multi-thousand chars to ~710) but did **not** hold for open-ended advisory questions.

## 2. Goals

- **G1 — Calibrated verbosity.** The agent reads what is actually being asked and matches response depth to it, "like Claude Code": a quick/factual question gets 1–3 sentences; a genuine analysis question gets focused analysis (conclusion-first, only the reasoning that drove it), not a mega-report every turn.
- **G2 — Interactive clarifying questions.** The agent can ask the user a question mid-conversation, presenting selectable options (single-select) while always allowing a free-text reply — Claude-Code-style — instead of guessing.

**Non-goals:** rigid length caps or a user-facing verbosity toggle (rejected in brainstorm — the user wants judgment, not a ceiling); true mid-run suspend/resume (rejected for complexity — ask-and-end-turn is used instead); collapsing the "Let me analyse…" pre-tool narration (user accepted leaving it — calibration should reduce it anyway).

## 3. Approach

### 3.1 Verbosity calibration (behaviour, prompt-only)

Rewrite `WEALTH_INSTRUCTIONS` in `packages/agent-harness/src/wealthAgent.ts`:

- **Calibration rules:** answer the question asked, at the depth it warrants.
  - Factual / quick question → 1–3 sentences, headline number bolded.
  - Genuine "analyze / advise / plan" question → focused analysis: lead with the conclusion, then only the few facts/numbers that drove it. One table maximum unless the user explicitly asks for a full/detailed breakdown or multi-step plan.
- **Anti-pattern list (explicit "don't"):** no "here's everything I could think of" dumps; do not restate the same number in prose *and* a table; no multi-phase roadmaps / emoji section headers unless explicitly requested; stop as soon as the question is answered.
- **Few-shot examples (2–3) embedded in the prompt:** each a short exchange demonstrating the pattern — (a) a quick question → one-line answer; (b) an open-ended advisory question → conclusion-first focused answer (a few hundred words, ≤1 table); optionally (c) a question missing a key fact → the agent calls `ask_user` instead of guessing. Few-shot examples are the primary lever; plain rules alone did not hold.

Calibration is prompt-tuning and is **not** unit-testable. It is verified by re-running representative real queries against `demo.db` and comparing message sizes/shape before vs after (as done for the earlier 19k→710 char check).

### 3.2 Interactive clarifying questions (`ask_user` tool, ask-and-end-turn)

**Mechanism:** the agent asks by calling a tool; the tool call ends the turn; the UI renders the question with option chips; the user's choice (or typed text) becomes the next message; the thread continues with full Mastra memory context. No suspend/resume.

- **`ask_user` is a LOCAL Mastra tool** defined in `packages/agent-harness` (via `createTool` from `@mastra/core/tools`), **not** in the MCP server. Rationale: it is a conversation-control tool with no finance backend; the MCP server (`packages/mcp`) stays purely about finance data. It is merged with the MCP toolset when the agent is built.
- **Tool signature:**
  ```ts
  ask_user({
    question: string,                    // the question to show the user
    options: { label: string }[],        // 1..N short single-select choices
  })
  // Note: free-text reply is ALWAYS allowed by the UI — it is not a per-call flag.
  ```
  The tool's `execute` returns its own validated args (it performs no side effect) so the framework has a tool-result to close the tool-call, but the harness treats the call as end-of-turn (see 3.3).
- **Instruction coupling:** the persona instructs — "When you are missing a fact needed to answer well, call `ask_user` with a crisp question and 2–4 concise options, then STOP. Do not also stream a long answer in the same turn."

### 3.3 Stream contract & data flow

New SSE event emitted by the agent route:
```
{ type: 'question', question: string, options: { label: string }[] }
```

Flow:
1. Agent calls `ask_user` → appears in Mastra `fullStream` as a `tool-call` chunk with `toolName: 'ask_user'`.
2. `streamEvents.mapChunk` maps that specific tool-call to `{ type: 'question', question, options }` (parsed from the chunk's tool input) — **not** to a `step`. All other tool-calls still map to `step`.
3. `runChat` yields the `question` event through the `events` stream; the turn then ends normally (the model stops after the tool call per instructions; if it emits trailing text it is still streamed as text, but the instruction discourages it).
4. `routes/agent.ts` writes an SSE `{ type: 'question', … }` frame.
5. Web `apiStream` adds `question` to `AgentEvent`; `useAgentChat` attaches `{ question, options }` to the current assistant message.
6. `AssistantPage` renders `QuestionChips`; clicking a chip calls `send(label)`; the free-text input remains active for a typed answer.

## 4. Components

| Layer | File | Change |
|---|---|---|
| agent-harness | `src/wealthAgent.ts` | Rewrite `WEALTH_INSTRUCTIONS`: calibration rules + anti-patterns + few-shot examples + when to call `ask_user`. |
| agent-harness | `src/askUserTool.ts` *(new)* | `createTool` defining `ask_user` (zod schema: `question`, `options[]`); `execute` returns its args. Export a builder. |
| agent-harness | `src/streamEvents.ts` | `mapChunk`: `tool-call` with `toolName === 'ask_user'` → `{type:'question',question,options}` (parse tool input, defensive defaults); other tool-calls unchanged → `step`. Add `HarnessEvent` variant `{type:'question',…}`. |
| agent-harness | `src/runChat.ts` | Merge `ask_user` local tool into the toolset passed to `buildWealthAgent`; pass `question` events through the `events` generator. |
| agent-harness | `src/index.ts` | Export new tool builder + updated `HarnessEvent`. |
| api | `src/routes/agent.ts` | Emit SSE `{type:'question',…}` on a `question` event. |
| web | `src/lib/apiStream.ts` | Add `{type:'question',question,options}` to `AgentEvent`; parse the SSE frame. |
| web | `src/features/assistant/useAgentChat.ts` | `ChatMessage` gains optional `question?: {question:string; options:{label:string}[]}`; store it on the current assistant message; persist as today. |
| web | `src/features/assistant/QuestionChips.tsx` *(new)* | Render the question + single-select chips; `onSelect(label) → send(label)`. |
| web | `src/features/assistant/AssistantPage.tsx` | Render `QuestionChips` under an assistant bubble that carries a `question`; free-text input stays active. |

No changes to `packages/core`, `packages/mcp`, or any finance tool.

## 5. Error handling

- `ask_user` called with **no options** or malformed input → `mapChunk` falls back: if a usable `question` string exists, emit a `question` event with `options: []` (UI shows the question, user answers via free text only); if not parseable, ignore the chunk (treated like any other tool-call) so nothing crashes.
- The turn-lifecycle, usage-row insertion, Bedrock/error-bubble handling, and localStorage persistence are all unchanged.
- A `question` event does not insert a second usage row — usage accounting stays one row per turn as today.

## 6. Testing (TDD)

Pure/unit-level (deterministic):
- `streamEvents.test.ts`: `ask_user` tool-call chunk → `{type:'question',question,options}`; a finance tool-call still → `{type:'step',…}`; malformed `ask_user` (no options) → question event with `options:[]`; unparseable → null.
- `askUserTool` test: schema validates; `execute` returns the passed args.
- api `agentChat.test.ts`: fake harness yields a `question` event → response body contains `"type":"question"` and the option labels.
- web `useAgentChat.test.ts`: a `question` event attaches `{question,options}` to the assistant message; a `QuestionChips` click calls `send` with the chosen label; persisted/restored like other messages.
- web `AssistantPage` test: an assistant message with `question` renders chips (role/labels present).

Manual / calibration (not unit-testable):
- Re-run the real questions from `thread-20260730185907887-5` (e.g. "what do you suggest for extra investments") against `demo.db` with a stable model; confirm replies are materially shorter and conclusion-first, and that a fact-missing question triggers `ask_user`.

Gate: full suite green (agent-harness + api + web), `tsc --build` clean, Groww golden-master unchanged (untouched), seam invariant holds (no drizzle/better-sqlite3 in agent-harness/src).

## 7. Rollout / sequencing

Single branch, TDD via the writing-plans → implementation flow. Order: (1) instructions rewrite + calibration verification; (2) `ask_user` tool + `streamEvents` mapping + `runChat` wiring + tests; (3) api SSE `question` frame + test; (4) web `apiStream`/`useAgentChat`/`QuestionChips`/`AssistantPage` + tests; (5) full-suite gate + live verification against `demo.db`.

## 8. Open questions / accepted trade-offs

- **Accepted:** the "Let me analyse…" pre-tool narration leak stays (user decision); calibration is expected to reduce its frequency.
- **Accepted:** calibration quality is prompt-dependent and model-dependent; verified empirically, not by unit tests. A future guardrail (post-generation self-condense) or a verbosity toggle remains a possible follow-up if instructions prove insufficient — explicitly out of scope here.
- **Accepted:** ask-and-end-turn means the agent's clarifying question and its eventual answer are two separate turns; Mastra memory continuity makes this seamless in practice.
