import { costUsd } from '@myfinance/agents';
import { resolveWealthRoute, type ResolverDeps, type ResolvedRoute } from './modelResolver';
import { buildAgentModel } from './agentModel';
import { mapChunk, type HarnessEvent } from './streamEvents';
import { buildFinanceMcpClient, getFinanceTools } from './mcpClient';
import { buildWealthMemory } from './memory';
import { buildWealthAgent } from './wealthAgent';

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

let threadCounter = 0;
function mintThreadId(now: () => string): string {
  threadCounter += 1;
  return `thread-${now().replace(/[^0-9]/g, '')}-${threadCounter}`;
}

export function makeWealthHarness(deps: HarnessDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const makeModel = deps.makeModel ?? ((route: ResolvedRoute) => buildAgentModel(route));

  return {
    async runChat(args: { threadId?: string; message: string }): Promise<ChatResult> {
      const route = resolveWealthRoute(deps);
      const threadId = args.threadId ?? mintThreadId(now);

      const mcpClient = buildFinanceMcpClient({ dbPath: deps.dbPath });
      const tools = await getFinanceTools(mcpClient);
      const memory = buildWealthMemory({ storeUrl: deps.memoryUrl });
      const model = await makeModel(route);
      const agent = buildWealthAgent({ model, memory, tools });

      const stream = await agent.stream(args.message, {
        memory: { resource: RESOURCE_ID, thread: threadId },
      });

      let resolveDone!: (v: { usage: { inputTokens: number; outputTokens: number }; threadId: string }) => void;
      let rejectDone!: (e: unknown) => void;
      const done = new Promise<{ usage: { inputTokens: number; outputTokens: number }; threadId: string }>((res, rej) => {
        resolveDone = res; rejectDone = rej;
      });

      // Prefer fullStream (text + tool-call step markers). Fall back to a
      // text-only stream when a mock model doesn't expose fullStream.
      const events = (async function* (): AsyncGenerator<HarnessEvent> {
        try {
          const full = (stream as any).fullStream;
          if (full) {
            for await (const chunk of full) {
              const ev = mapChunk(chunk);
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
            ts: now(), task: 'wealth_chat', providerId: route.providerId,
            dialect: route.dialect, model: route.modelString,
            inputTokens, outputTokens, callCount: 1,
            costUsd: costUsd(inputTokens, outputTokens, route.inputPerM, route.outputPerM),
            ok: 1,
          });
          resolveDone({ usage: { inputTokens, outputTokens }, threadId });
        } catch (e) {
          deps.usageRepo.insert({
            ts: now(), task: 'wealth_chat', providerId: route.providerId,
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
  };
}
