# MyFinance Web — Master Plan

> **This is the durable memory of the project.** Chat context is disposable; this
> document and the per-layer specs are ground truth. Every session starts by reading
> this file and ends by updating it.

**Date created:** 2026-06-11
**Status:** L0 Foundation complete (branch `layer/0-foundation`, 175 tests green, Groww-validated). L1 next.

---

## 1. North Star

A self-hosted **personal wealth manager**: one place that ingests and stores all of
my finances (expenses, investments, loans), lets me visualize them, and — the actual
point — gives me a layer of **AI agents** that reason over that data and help me grow
my wealth.

The agents are the product. The backend, UI, and MCP server exist primarily to feed
them. The "Investment Analyzer" (gather MF holdings → compute sector split → fetch
news → tell me what's doing well/badly and what will help/hurt) is the canonical
example; the long-term goal is a **wealth-manager orchestrator** that delegates to
specialist agents (expense / investment / loan) and synthesizes holistic advice.

### Why re-platform from the existing app?
The existing Expo/React Native app (`/Users/vkhandelwal/Documents/MyFinance`,
current local-first version) has clean, working, **validated** business logic but
the mobile runtime **cannot spawn agents, run long background analysis, or reach the
internet** the way a real agent system needs. The business logic is portable; the AI
runtime forces a server. We keep the logic, move it to a Node/TS backend, and build
the agent layer on top.

---

## 2. Locked Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Users / hosting | **Single-user, self-hosted, local-first preserved.** Auth added later if needed. | Keeps v1 lean; no multi-tenancy tax up front. |
| Backend language | **Node + TypeScript** | Existing `features/` logic (parsers, categorization, XIRR, AMFI) ports over as-is; one language across UI/API/agents/tools; shared types end-to-end; TS-first MCP + Agent SDK ecosystem. |
| Agent engine | **Claude Agent SDK (TypeScript)** | Purpose-built for orchestrator + subagent coordination, tool loops, context mgmt — exactly the capability the mobile app lacked. |
| Tool contract | **MCP server wrapping `core` logic** | Agents reach finance data only through MCP tools. Clean, swappable contract. |
| Database | **SQLite now → Postgres + pgvector later**, via **Drizzle ORM** | Local-first start; no raw dialect-specific SQL in business logic so the Postgres+RAG migration is config, not rewrite. |
| RAG (future) | Vectors live in the **same DB** (sqlite-vec now / pgvector later) | Retrieval can join vector similarity with actual finance data; no second system. |

**Greenfield sanity check:** even with no existing code this product (a full-stack app
with an intelligent layer, not a quant/ML research system) would still favor TypeScript;
with the existing TS codebase the choice is decisive.

---

## 3. System Architecture (one-pager)

```
┌─────────────────────────────────────────────────────────┐
│  L4  AI LAYER — Claude Agent SDK                          │
│      Wealth-Manager (orchestrator)                        │
│        ├─ Expense agent   ├─ Investment agent             │
│        └─ Loan agent      + Chat-with-your-data           │
│                  │ calls tools via                        │
├──────────────────┼────────────────────────────────────────┤
│  L3  MCP SERVER — tool contract over finance data         │
├──────────────────┼────────────────────────────────────────┤
│  L2  WEB UI ──────┤ reads REST API                         │
│      Expenses · Investments · Loans (visualize)           │
├──────────────────┼────────────────────────────────────────┤
│  L1  DATA API + INGESTION (REST/JSON)                     │
│      import statements/investments, dedupe, categorize    │
├──────────────────┼────────────────────────────────────────┤
│  L0  FOUNDATION — Node/TS server + shared `core` package  │
│      Drizzle ORM ──► SQLite (now) ──► Postgres+pgvector   │
└─────────────────────────────────────────────────────────┘
   Shared TS types flow top-to-bottom — one source of truth
```

### Proposed repo shape (monorepo)
```
/packages/core      ← ported features/ (parsers, categorization, portfolio/XIRR) + Drizzle schema + shared types
/packages/api       ← L0/L1 REST server
/packages/mcp       ← L3 MCP server (imports core)
/packages/agents    ← L4 Claude Agent SDK agents
/apps/web           ← L2 web UI
/apps/mobile        ← existing RN app (later: calls api instead of local logic)
/docs/superpowers/specs   ← per-layer specs
```
`core` is the keystone: every layer above imports it, so the hard-won logic has exactly
one home.

---

## 4. Build Order (each = its own spec → plan → build cycle)

Build bottom-up; nothing above can be concretely designed until the layer below is pinned.

| Layer | Name | Scope | Status | Spec |
|---|---|---|---|---|
| **L0** | Foundation | Node/TS server skeleton, Drizzle schema + DB, port `features/`→`core`, basic REST API | ✅ Done | [spec](specs/2026-06-12-l0-foundation-design.md) · [plan](plans/2026-06-12-l0-foundation.md) |
| **L1** | Ingestion + Data API | Server-side statement/investment import (MF model), **multi-platform parser registry** (Groww/HDFC now; ET Money etc. drop-in later), **multi-account** ingestion + reads, dedupe, categorize; rule CRUD; the read API for UI + agents | 🟡 In progress (spec + plan written, build not started) | [spec](specs/2026-06-12-l1-ingestion-design.md) · [plan](plans/2026-06-13-l1-ingestion.md) |
| **L1.5** | Unified Investment Model + first-class Accounts | **Generalize the investment foundation to all asset classes** (mutual funds, stocks, PPF, FD, cash): `accounts` + `assets` (assetClass) + generalized cashflows; per-class **valuation strategy** (market price API / computed interest / manual) and **ingestion strategy** (file-import via L1's registry / manual-entry CRUD); **net-worth rollup** + per-asset insights; migrate existing MF data (Groww golden-master is the safety net). **Also makes `accounts` first-class for EXPENSES** — today the `transactions` table has no account dimension (single implicit account); L1.5 adds it so the user can track multiple bank/expense accounts, sharing one unified accounts model with investments. Reshapes `core` schema → T1 with Groww re-validation. | ⬜ Not started | — |
| **L2** | Web UI | Web frontend: Expenses, Investments (unified multi-asset net-worth view), Loans visualization; reads the API. Enriched expense reads (date-range/direction/search filters + `/expenses/summary`) designed here against concrete layouts. | ⬜ Not started | — |
| **L3** | MCP Server | Wraps data layer as MCP tools — the agent tool contract | ⬜ Not started | — |
| **L4** | AI / Wealth Manager | Chat-with-your-data, then specialist agents + orchestrator (Claude Agent SDK) | ⬜ Not started | — |

> Update this table as layers progress. Status legend: ⬜ Not started · 🟡 In progress · ✅ Done · ⛔ Blocked.

---

## 5. SDLC — Tiered by Work Size

**Principle:** specs + this master plan are durable memory; chat context is disposable.
Each layer/feature is a fresh session that re-hydrates from written artifacts, not prior chat.
**Don't pay full-process cost for small work** — triage first, then run the matching tier.

### Triage (the FIRST thing every session does)
A minimal **SessionStart hook** injects: *"Classify this task's tier per the
`myfinance-sdlc` skill, then proceed."* The heavy procedure lazy-loads (via the skill)
only once a tier needs it — T3 bug fixes never pay for it.

Classification rules:
- **Touches `core` financial logic (XIRR, categorization, parsers, portfolio math)? → always T1**, regardless of size, **with Groww re-validation.** This code regresses silently (see project-memory: XIRR convergence, AMFI matching).
- New layer or architectural surface → **T1**.
- Scoped change, a few files, no new contracts → **T2**.
- One obvious localized fix → **T3**.
- **When unsure, round up a tier.** Cheap insurance.

**Confirmation gate:** after classifying, the agent states the chosen tier + the rule
that selected it, then **asks the user to confirm or override before proceeding.** No
brainstorming/planning/coding starts until confirmed. Prevents silent under-tiering.

### Tiers
| Tier | What | Process |
|---|---|---|
| **T1 — Layer / feature build** | A whole layer (L0–L4), substantial feature, OR any core-logic change | **Full discipline:** hydrate → brainstorm (write spec) → writing-plans → branch `layer/<n>-name` → **TDD** → subagent code review → PR → update master plan + project-memory |
| **T2 — Small feature / enhancement** | Scoped change, few files, no new architecture | **Light:** short inline plan (no formal spec) → implement → tests for new logic → self-review |
| **T3 — Bug fix / tweak** | Localized fix, copy change, obvious correction | **Direct:** fix → verify (add/run test if logic changed) → done |

### Discipline rules (apply to T1)
- **One layer per session** — protects context.
- **Spec is the contract** — agents implement to the spec; drift = bug.
- **TDD is non-negotiable** — the test suite is how we trust code the agent wrote.
- **`core` is frozen-ish** — changes require re-validating against Groww.
- **Master plan = the index** — read first, update last, every session.

---

## 6. Orchestration Wiring (how sessions self-govern)

| Piece | Role |
|---|---|
| **SessionStart hook** (minimal) | Deterministically injects "read MASTER_PLAN.md + classify tier per `myfinance-sdlc`" into every session. The linchpin guarantee. |
| **`CLAUDE.md`** | Always-loaded pointer to this plan + the skill (backstop to the hook). |
| **`.claude/skills/myfinance-sdlc/`** | The fat procedure: triage decision tree + the three tier processes. Lazy-loaded only when invoked. |
| **`docs/superpowers/MASTER_PLAN.md`** (this file) | Project state: decisions, build order, layer status, spec links. |
| **`docs/superpowers/specs/`** | Per-layer specs (the contracts). |
| **project-memory MCP** | Decisions + research findings (already wired). Hydrate from it; save decisions at session end. |

> A plugin was considered and rejected (YAGNI): plugins distribute skills across
> projects/people; this is one repo, one person. A local project skill suffices.
> Promote to a plugin only if this SDLC is ever reused elsewhere.

---

## 7. How To Start A New Session (for future me / future agent)

1. Read this file (`docs/superpowers/MASTER_PLAN.md`) fully.
2. Check `mcp__project-memory__get_context` for decisions/findings.
3. Classify the task tier (§5). When unsure, round up.
4. Run the matching process. For a layer build (T1), the next undone layer in §4 is the target.
5. **Before ending:** update the §4 status table, save decisions to project-memory, link any new spec.

---

## 8. Open Items / Next Step

- [x] Build the orchestration wiring (SessionStart hook + `myfinance-sdlc` skill + CLAUDE.md pointer). **Done** (commit 644a23e). Files: `.claude/hooks/sdlc-session-start.js`, `.claude/skills/myfinance-sdlc/SKILL.md`, CLAUDE.md pointer block.
  - ⚠️ The hook is registered in `.claude/settings.local.json`, which is **gitignored**. On a fresh clone / new machine, re-add the SessionStart hook entry pointing at `.claude/hooks/sdlc-session-start.js`. The hook script and skill themselves are committed.
- [x] Brainstorm **L0 — Foundation** spec → `specs/2026-06-12-l0-foundation-design.md`. Plan → `plans/2026-06-12-l0-foundation.md`.
- [x] **L0 build COMPLETE 2026-06-12** on branch `layer/0-foundation` (T1, subagent-driven, 28 commits). All 7 phases done: monorepo scaffold; `packages/core` (Drizzle 8-table schema + CHECKs + migrations + client; 7 repos; domain port — xirr verbatim, returns/portfolio repo-injected, categorize, nav, amfiMatcher; import parsers + orchestration; seed + public index); `packages/api` (Fastify read-only skeleton: /health, /transactions, /investments/summary, /investments/returns). **175 tests green** (core 170 + api 5). Typecheck clean via `tsc --build`. Seam invariant verified (no Drizzle/driver import in domain/import).
  - **T1 core-logic gate PASSED:** Groww golden-master reproduces real per-scheme XIRR within **0.046pp** (worst case) across 6 schemes / 104 real SIP transactions. Final code review: READY TO MERGE, no blocking issues.
  - Decisions logged: money stays REAL/float (paise rejected, id `e7a83f32`); repository-over-Drizzle seam; import ported into L0 (L1 = ingestion API over it); XIRR terminal-flow date uses LOCAL time → deploy with TZ=Asia/Kolkata (id `1a01f88c`). Known minor: `autoMatchAmfiCodes` force-rematch is a no-op (id `4cbcde9d`).
- [x] L0 `layer/0-foundation` merged to `main` (PR #1, merge commit `67d15c6`).
- [ ] **In progress:** **L1 (Ingestion + Data API)** — spec at [specs/2026-06-12-l1-ingestion-design.md](specs/2026-06-12-l1-ingestion-design.md), plan at [plans/2026-06-13-l1-ingestion.md](plans/2026-06-13-l1-ingestion.md). Server-side import endpoints over ported `core` import logic, dedupe, categorize, rule CRUD, expanded read API. **Two forward-looking seams baked in:** (1) multi-platform parser registry keyed by `platform` (Groww/HDFC now; ET Money etc. are drop-in modules emitting the same normalized `ParsedData`), (2) multi-account as first-class (multiple `accountName`/`investmentApp` per asset; `GET /investments/accounts`). Enriched expense reads deferred to L2.
  - ▶ **RESUME HERE (next session):** spec + plan are written and committed; **the build has NOT started.** Execute the 10-task TDD plan via the `superpowers:subagent-driven-development` skill (fresh subagent per task) — start at **Task 0** (branch `layer/1-ingestion` off `main`, add `@fastify/multipart`). The plan is fully self-contained (exact file paths, code, commands, expected output). Node 20 mandatory; typecheck via `tsc --build`. Push/PR with `gh auth switch --user ak688744`. No code changes exist on disk yet — only docs.
- [ ] **NEW — L1.5 (Unified Investment Model):** before L2. A dedicated brainstorm→spec→plan→build cycle that generalizes the MF-only investment foundation into an **all-asset-class** model so the investment section is a single net-worth view across mutual funds, stocks, PPF, FD, cash. Organizing insight: asset classes differ on two axes — **ingestion** (`file-import` via L1's parser registry vs `manual-entry` CRUD, since PPF/FD/cash are user-entered) and **valuation** (`market` = qty×live price API, `computed` = interest compounding to a date for PPF/FD, `manual` = user-stated). Generalized schema ≈ `accounts` + `assets`(assetClass) + generalized cashflows + per-class valuation/ingestion strategies + net-worth rollup. **Reshapes `core` schema → T1 with Groww re-validation;** existing MF data migrated in, golden-master is the safety net. L1's parser registry + HTTP/multipart layer carry forward; only the investment orchestrators/repos get generalized (expense import untouched). **Decided 2026-06-13:** build L1 on the current MF model first (validated vertical slice) rather than redesigning the foundation up front — L1's ingestion *pattern* survives the generalization, so it is proving ground, not throwaway.
