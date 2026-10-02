import type { FastifyInstance } from 'fastify';
import { AgentConfigError } from '@myfinance/agent-harness';
import type { Harness } from '../plugins/harness';
import { badRequest, notFound } from '../errors';

function parseAgent(v: unknown): 'wealth' | 'expense' {
  if (v === undefined || v === '') return 'wealth';
  if (v === 'wealth' || v === 'expense') return v;
  throw badRequest("agent must be 'wealth' or 'expense'");
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function agentRoutes(app: FastifyInstance, opts: { harness: Harness }): Promise<void> {
  app.get<{ Querystring: { agent?: string; limit?: string } }>('/agent/threads', async (req) => {
    const agent = parseAgent(req.query.agent);
    const parsed = parseInt(req.query.limit ?? '', 10);
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 30;
    return { data: await opts.harness.listThreads({ agent, limit }) };
  });

  app.get<{ Params: { id: string }; Querystring: { agent?: string } }>('/agent/threads/:id', async (req) => {
    const agent = parseAgent(req.query.agent);
    const thread = await opts.harness.getThread({ agent, threadId: req.params.id });
    if (!thread) throw notFound('Thread not found');
    return { data: thread };
  });

  app.post('/agent/chat', async (req, reply) => {
    const body = (req.body ?? {}) as { threadId?: string; message?: string; agent?: 'wealth' | 'expense' };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      throw badRequest('message is required');
    }

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    reply.hijack();

    try {
      const chat = await opts.harness.runChat({ threadId: body.threadId, message, agent: body.agent });
      reply.raw.write(sse({ type: 'start', threadId: chat.threadId }));
      for await (const ev of chat.events) {
        if (ev.type === 'text') {
          reply.raw.write(sse({ type: 'token', text: ev.text }));
        } else if (ev.type === 'step') {
          reply.raw.write(sse({ type: 'step', label: ev.label }));
        } else if (ev.type === 'question') {
          reply.raw.write(sse({ type: 'question', question: ev.question, options: ev.options }));
        }
      }
      const fin = await chat.done;
      reply.raw.write(sse({ type: 'done', threadId: fin.threadId, usage: fin.usage }));
    } catch (e) {
      app.log.error({ err: e }, 'agent chat failed');
      const raw = e instanceof Error ? e.message : '';
      const errMessage =
        e instanceof AgentConfigError
          ? e.message
          : /token is expired|sso login/i.test(raw)
            ? 'Your AWS SSO session has expired. Run `aws sso login` and try again.'
            : 'The wealth agent hit an error. Please try again.';
      reply.raw.write(sse({ type: 'error', message: errMessage }));
    } finally {
      reply.raw.end();
    }
  });
}
