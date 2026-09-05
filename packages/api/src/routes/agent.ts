import type { FastifyInstance } from 'fastify';
import { AgentConfigError } from '@myfinance/agent-harness';
import type { Harness } from '../plugins/harness';
import { badRequest } from '../errors';

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function agentRoutes(app: FastifyInstance, opts: { harness: Harness }): Promise<void> {
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
      const errMessage =
        e instanceof AgentConfigError
          ? e.message
          : 'The wealth agent hit an error. Please try again.';
      reply.raw.write(sse({ type: 'error', message: errMessage }));
    } finally {
      reply.raw.end();
    }
  });
}
