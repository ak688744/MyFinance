# Project Context

## MyFinance Web Re-Platform — Read First
This repo is being re-platformed into a Node/TS backend + web UI + MCP server +
Claude Agent SDK wealth-manager, built across many sessions. **The master plan at
`docs/superpowers/MASTER_PLAN.md` is project ground truth — read it before any work.**

Work is governed by a tiered SDLC: before brainstorming, planning, or coding,
**invoke the `myfinance-sdlc` skill** to classify the task (T1 full discipline /
T2 light / T3 direct) and run the matching process. Any change to core financial
logic (XIRR, categorization, parsers, portfolio math) is always T1. When unsure,
round up a tier.

<!-- project-memory-autosave:start -->
## Project Memory (MCP Tools)
<!-- Auto-managed by project-memory plugin. Do not edit between markers. -->

**ALWAYS use these MCP tools instead of manual file exploration:**

| When you want to... | Use this tool |
|---------------------|---------------|
| Start any task | `mcp__project-memory__get_context` (call FIRST) |
| Find prior research/decisions | `mcp__project-memory__memory_search` |
| Find a reusable script | `mcp__project-memory__script_search` |
| Understand code structure | `mcp__project-memory__code_search` then `code_context` |
| Check impact of a change | `mcp__project-memory__code_impact` |
| Save a discovery | `mcp__project-memory__memory_save` |
| End session | `mcp__project-memory__session_summary` |

**IMPORTANT**: Call `code_search` or `code_context` BEFORE using Read/Grep/Glob.
The code graph has structural knowledge that eliminates redundant file reads.

### CLI fallbacks (if MCP unavailable):
```bash
node "/Users/vkhandelwal/Documents/project-memory/scripts/check-memory.js" "search keywords"
node "/Users/vkhandelwal/Documents/project-memory/scripts/save-research.js" "<topic>" "<tags>" "<finding>"
node "/Users/vkhandelwal/Documents/project-memory/scripts/save-decision.js" "<category>" "<decision>" "<rationale>"
node "/Users/vkhandelwal/Documents/project-memory/scripts/session-summary.js"
```

### Auto-save rules:
- **Decisions**: Save automatically via `mcp__project-memory__memory_save` (type=decision)
- **Research**: Save automatically via `mcp__project-memory__memory_save` (type=research)
- **Session end**: ALWAYS call `mcp__project-memory__session_summary` before final response
<!-- project-memory-autosave:end -->

<!-- project-memory:start -->
## Project Decisions
<!-- Auto-managed by project-memory plugin. Do not edit between markers. -->

## Architecture
- Portfolio calculations use transactions-only, holdings for metadata — portfolioService.ts rewritten to derive holdings/summary/returns entirely from investment_transactions + latest NAV. investment_holdings table is still written (archive) but never read for calculations. Period view uses cohort math: invested-in-period, current value of those units, XIRR over window cash flows. ALL = lifetime.
- AI feature uses user-provided API keys with multi-provider support — Users provide their own API keys (Claude/Gemini/OpenAI). Keys stored locally on device (SecureStore). App calls LLM APIs directly with tool_use for financial queries over local SQLite data. No backend proxy needed. Tool layer structured for future MCP server extraction.
- AI v1 scope: Gemini provider, model selection, token cost display, no history — v1 starts with Gemini only. Users pick model (Flash/Pro). No conversation persistence — fresh each session. Show token cost on screen (input/output tokens × model pricing). Tool layer is provider-agnostic for future Claude/OpenAI addition.
- MyFinance Web re-platform: Node/TS monorepo, Claude Agent SDK, MCP, SQLite→Postgres via Drizzle — Re-platforming the local-first RN app into a self-hosted (single-user, auth later) wealth-manager. Stack locked: Node+TypeScript backend (ports existing features/ as-is); Claude Agent SDK for the agent orchestrator + specialist agents; MCP server as the tool contract over finance data; Drizzle ORM targeting SQLite now → Postgres+pgvector later (RAG vectors in same DB). Monorepo: packages/core (ported features/ + schema + types), packages/api, packages/mcp, packages/agents, apps/web, apps/mobile. The AI agent layer is the product; backend/UI/MCP exist to feed it. Bottom-up build order L0 Foundation → L1 Ingestion+API → L2 Web UI → L3 MCP → L4 AI. Full plan: docs/superpowers/MASTER_PLAN.md.

## Convention
- Tiered SDLC for agent-built work: T1 full discipline / T2 light / T3 direct, with core-logic override and SessionStart-hook triage — Work is triaged by size to save tokens. T1 (layer/substantial feature OR any core-logic change): full discipline — brainstorm spec → writing-plans → branch → TDD → subagent review → PR → update master plan. T2 (scoped, few files): short inline plan → implement → tests → self-review. T3 (localized bug/tweak): direct fix → verify. OVERRIDE: any change touching core financial logic (XIRR, categorization, parsers, portfolio math) is ALWAYS T1 with Groww re-validation, regardless of size (it regresses silently). When unsure, round up a tier. Enforced by a minimal SessionStart hook that injects 'classify tier per myfinance-sdlc skill'; the fat procedure lives in .claude/skills/myfinance-sdlc and lazy-loads. CLAUDE.md holds a backstop pointer. Plugin rejected (YAGNI). MASTER_PLAN.md is durable state, read-first/update-last every session.

## Setup
- Initialized project-memory for MyFinance — Initial setup for local project memory

## Tooling
- project-memory setup complete for MyFinance — MCP server, hooks (SessionStart/PreToolUse/PostToolUse/Stop), daemon, and code graph (36 files, 200 nodes, 773 edges) are all active. Configured via .mcp.json + .claude/settings.local.json. Dashboard running at http://localhost:3777.

<!-- project-memory:end -->

<!-- project-memory-research:start -->
## Research Memory
<!-- Auto-managed by project-memory plugin. Do not edit between markers. -->

_(4 older findings filtered — older than 7 days. Run check-memory.js to search all including stale.)_

_All 4 findings are older than 7 days. Run check-memory.js to search them._

<!-- project-memory-research:end -->

<!-- project-memory-scripts:start -->
## Script Library
<!-- Auto-managed by project-memory plugin. Do not edit between markers. -->

5 script templates (5 total scripts). **Reuse these — fill in {{params}} instead of rebuilding commands:**

- **Check if port 3777 is accessible** (1x): `curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3777 2>&1; echo "---"; lsof -iTCP:3777 -sTCP:LISTEN 2>&1 | head -5`
- **Get latest NAV for Parag Parikh ELSS Regular Growth** (1x): `curl -s "https://api.mfapi.in/mf/147482" 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print('Scheme:', d['meta']['scheme_name']); print('Latest NAV:', d['data'][0])"`
- **Search Motilal Oswal Midcap** (1x): `curl -s "https://api.mfapi.in/mf/search?q=motilal%20oswal%20midcap" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for x in d[:8]:
    print(f'{x[\"schemeCode\"]} - {x[\"schemeName\"]}')
"`
- **Get Motilal Oswal Midcap Direct Growth NAV history** (1x): `curl -s "https://api.mfapi.in/mf/127042" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('Scheme:', d['meta']['scheme_name'])
print('Latest NAV:', d['data'][0])
# Show some historical NAVs
for i in [0, 50, 100, 200, 300, 500]:
    if i < len(d['data']):
        print(f'  data[{i}]: {d[\"data\"][i]}')
"`
- **Verify which Motilal scheme we're using** (1x): `curl -s "https://api.mfapi.in/mf/127042" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('Scheme:', d['meta']['scheme_name'])
print('Latest NAV:', d['data'][0])
print('AMFI code:', d['meta']['scheme_code'])
" 2>&1`

<!-- project-memory-scripts:end -->
