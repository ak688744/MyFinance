import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Uniform error envelope: { error: { message, statusCode } }.
 * Respects err.statusCode when present (e.g. validation 400s thrown by routes),
 * defaults to 500 otherwise.
 */
export function errorHandler(
  err: FastifyError,
  _req: FastifyRequest,
  reply: FastifyReply,
): void {
  const statusCode = err.statusCode ?? 500;
  reply.status(statusCode).send({
    error: {
      message: err.message,
      statusCode,
    },
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(errorHandler);
}
