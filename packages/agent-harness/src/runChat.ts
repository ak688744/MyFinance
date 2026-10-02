import { costUsd } from '@myfinance/agents';
import { resolveRoute, type ResolverDeps, type ResolvedRoute } from './modelResolver';
import { buildAgentModel } from './agentModel';
import { createEventMapper, type HarnessEvent } from './streamEvents';
import { buildRunPythonTool, type DatasetResolver } from './runPythonTool';
import { createSandboxRuntime, type SandboxRuntime } from './sandbox';
import { buildFinanceMcpClient, getFinanceTools } from './mcpClient';
import { buildWealthMemory } from './memory';
import { buildWealthAgent } from './wealthAgent';
import { buildExpenseAgent, filterTools, EXPENSE_TOOL_ALLOWLIST } from './expenseAgent';
import { buildInvestmentAgent, INVESTMENT_TOOL_ALLOWLIST } from './investmentAgent';
import { buildAskUserTool } from './askUserTool';
import { toHistoryMessages, summarizeThread, type HistoryMessage, type ThreadSummary } from './threadHistory';

export type AgentKind = 'wealth' | 'expense' | 'investment';

export type UsageInsert = {
  ts: string; task: string; providerId: string; dialect: string; model: string;
  inputTokens: number; outputTokens: number; callCount: number;
  costUsd: number | null; ok: 0 | 1;
};

export type HarnessDeps = ResolverDeps & {
  usageRepo: { insert: (e: UsageInsert) => number };
  now?: () => string;
  dbPath: string;
  memoryUrl: string;
  makeModel?: (route: ResolvedRoute) => unknown | Promise<unknown>;
  /** Resolves run_python datasets (api-provided). Without it the investment agent has no run_python. */
  resolveDataset?: DatasetResolver;
  /** Injected sandbox runtime (tests). Defaults to the real hardened Pyodide runtime, started lazily. */
  sandbox?: SandboxRuntime;
};

export type ChatResult = {
  threadId: string;
  /** Text-only view of the reply (backward-compatible). */
  textStream: AsyncIterable<string>;
  /** Full event stream: interleaved text deltas + step markers (tool calls). */
  events: AsyncIterable<HarnessEvent>;
  done: Promise<{ usage: { inputTokens: number; outputTokens: number }; threadId: string }>;
};

const RESOURCE_ID = 'user';

/** Memory resource id that scopes an agent's threads. */
export function resourceIdFor(agent: AgentKind): string {
  return agent === 'expense' ? 'expense-agent' : agent === 'investment' ? 'investment-agent' : RESOURCE_ID;
}

let threadCounter = 0;
function mintThreadId(now: () => string): string {
  threadCounter += 1;
  return `thread-${now().replace(/[^0-9]/g, '')}-${threadCounter}`;
}

export function makeWealthHarness(deps: HarnessDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const makeModel = deps.makeModel ?? ((route: ResolvedRoute) => buildAgentModel(route));
  // Spawns nothing until the first run_python call.
  const sandbox = deps.sandbox ?? createSandboxRuntime();

  let historyMemory: ReturnType<typeof buildWealthMemory> | undefined;
  const getHistoryMemory = () => (historyMemory ??= buildWealthMemory({ storeUrl: deps.memoryUrl }));

  return {
    async listThreads(args: { agent?: AgentKind; limit?: number } = {}): Promise<ThreadSummary[]> {
      const resourceId = resourceIdFor(args.agent ?? 'wealth');
      const limit = Math.min(Math.max(Math.trunc(args.limit ?? 30) || 30, 1), 100);
      const memory = getHistoryMemory();
      const { threads } = await memory.listThreads({
        filter: { resourceId },
        perPage: limit,
        page: 0,
        orderBy: { field: 'updatedAt', direction: 'DESC' },
      });
      const out: ThreadSummary[] = [];
      for (const t of threads) {
        const { messages } = await memory.recall({ threadId: t.id, resourceId, perPage: false });
        out.push(summarizeThread(t, toHistoryMessages(messages as any)));
      }
      return out;
    },

    async getThread(args: { agent?: AgentKind; threadId: string }): Promise<
      { id: string; title: string; messages: HistoryMessage[] } | null
    > {
      const resourceId = resourceIdFor(args.agent ?? 'wealth');
      const memory = getHistoryMemory();
      const thread = await memory.getThreadById({ threadId: args.threadId });
      if (!thread || thread.resourceId !== resourceId) return null;
      const { messages } = await memory.recall({ threadId: thread.id, resourceId, perPage: false });
      const history = toHistoryMessages(messages as any);
      return { id: thread.id, title: summarizeThread(thread, history).title, messages: history };
    },

    async runChat(args: { threadId?: string; message: string; agent?: AgentKind }): Promise<ChatResult> {
      const agentKind = args.agent ?? 'wealth';
      const task = agentKind === 'expense'
        ? 'expense_agent'
        : agentKind === 'investment'
          ? 'investment_agent'
          : 'wealth_chat';
      const route = resolveRoute(deps, task);
      const threadId = args.threadId ?? mintThreadId(now);
      const resourceId = resourceIdFor(agentKind);

      const mcpClient = buildFinanceMcpClient({ dbPath: deps.dbPath });
      const financeTools = await getFinanceTools(mcpClient);
      const pythonTools = agentKind === 'investment' && deps.resolveDataset
        ? buildRunPythonTool({ threadId, sandbox, resolveDataset: deps.resolveDataset })
        : {};
      const allTools = { ...financeTools, ...buildAskUserTool(), ...pythonTools };
      const tools = agentKind === 'expense'
        ? filterTools(allTools, EXPENSE_TOOL_ALLOWLIST)
        : agentKind === 'investment'
          ? filterTools(allTools, INVESTMENT_TOOL_ALLOWLIST)
          : allTools;
      const memory = buildWealthMemory({ storeUrl: deps.memoryUrl });
      const model = await makeModel(route);
      const agent = agentKind === 'expense'
        ? buildExpenseAgent({ model, memory, tools })
        : agentKind === 'investment'
          ? buildInvestmentAgent({ model, memory, tools })
          : buildWealthAgent({ model, memory, tools });

      const stream = await agent.stream(args.message, {
        memory: { resource: resourceId, thread: threadId },
        // Mastra's default is 5 steps; multi-tool analyses (status, lookthrough, run_python...) hit
        // it and the turn ends mid-tool-use with no answer text.
        maxSteps: 25,
      });

      let resolveDone!: (v: { usage: { inputTokens: number; outputTokens: number }; threadId: string }) => void;
      let rejectDone!: (e: unknown) => void;
      const done = new Promise<{ usage: { inputTokens: number; outputTokens: number }; threadId: string }>((res, rej) => {
        resolveDone = res; rejectDone = rej;
      });
      // A failed turn rejects `done` while callers are still draining `events` (which throws
      // first). Mark it handled so that doesn't become a process-killing unhandled rejection;
      // anyone who awaits `done` still observes the rejection.
      done.catch(() => {});

      // Prefer fullStream (text + tool-call step markers). Fall back to a
      // text-only stream when a mock model doesn't expose fullStream.
      const mapEvent = createEventMapper();
      const events = (async function* (): AsyncGenerator<HarnessEvent> {
        try {
          const full = (stream as any).fullStream;
          if (full) {
            for await (const chunk of full) {
              // Mastra reports model/credential failures as an in-band error chunk; without
              // this the turn would end "successfully" with an empty reply.
              if ((chunk as { type?: string })?.type === 'error') {
                const err = (chunk as { payload?: { error?: unknown } }).payload?.error;
                throw err instanceof Error ? err : new Error(String(err ?? 'Model call failed'));
              }
              const ev = mapEvent(chunk);
              if (ev) yield ev;
            }
          } else {
            for await (const chunk of stream.textStream) {
              const text = chunk as string;
              if (text) yield { type: 'text', text };
            }
          }
          const usage = await stream.usage;
          const inputTokens = usage?.inputTokens ?? 0;
          const outputTokens = usage?.outputTokens ?? 0;
          deps.usageRepo.insert({
            ts: now(), task, providerId: route.providerId,
            dialect: route.dialect, model: route.modelString,
            inputTokens, outputTokens, callCount: 1,
            costUsd: costUsd(inputTokens, outputTokens, route.inputPerM, route.outputPerM),
            ok: 1,
          });
          resolveDone({ usage: { inputTokens, outputTokens }, threadId });
        } catch (e) {
          deps.usageRepo.insert({
            ts: now(), task, providerId: route.providerId,
            dialect: route.dialect, model: route.modelString,
            inputTokens: 0, outputTokens: 0, callCount: 1, costUsd: 0, ok: 0,
          });
          rejectDone(e);
          throw e;
        } finally {
          if (typeof (mcpClient as any).disconnect === 'function') {
            await (mcpClient as any).disconnect().catch(() => {});
          }
        }
      })();

      // Text-only view derived from the single event source (backward-compatible).
      const textStream = (async function* () {
        for await (const ev of events) {
          if (ev.type === 'text') yield ev.text;
        }
      })();

      return { threadId, textStream, events, done };
    },
    close(): void {
      sandbox.close();
    },
  };
}
