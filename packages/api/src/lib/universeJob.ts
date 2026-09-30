export type UniverseRefresh = (onProgress: (done: number, total: number) => void) => Promise<unknown>;

export type UniverseJobStatus = {
  state: 'idle' | 'running' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  progress: { done: number; total: number } | null;
  builtAt: string | null;
  asOf: string | null;
};

/** In-process, single-flight background job. State resets on server restart; builtAt/asOf come from the DB. */
export function makeUniverseJob(
  run: UniverseRefresh,
  getMeta: () => { builtAt: string; asOf: string | null } | null,
  logger?: { warn?: (o: unknown, m?: string) => void },
) {
  let state: UniverseJobStatus['state'] = 'idle';
  let startedAt: string | null = null;
  let finishedAt: string | null = null;
  let lastError: string | null = null;
  let progress: UniverseJobStatus['progress'] = null;
  let current: Promise<void> | null = null;

  return {
    status(): UniverseJobStatus {
      const meta = getMeta();
      return { state, startedAt, finishedAt, lastError, progress, builtAt: meta?.builtAt ?? null, asOf: meta?.asOf ?? null };
    },
    start(): { started: boolean } {
      if (state === 'running') return { started: false };
      state = 'running';
      startedAt = new Date().toISOString();
      finishedAt = null;
      lastError = null;
      progress = null;

      let runPromise: Promise<unknown>;
      try {
        runPromise = run((done, total) => { progress = { done, total }; });
      } catch (e) {
        // Handle synchronous throw from run()
        state = 'failed';
        lastError = (e as Error)?.message ?? String(e);
        finishedAt = new Date().toISOString();
        current = null;
        logger?.warn?.({ err: lastError }, 'universe refresh failed');
        return { started: true };
      }

      current = runPromise
        .then(() => { state = 'idle'; })
        .catch((e) => {
          state = 'failed';
          lastError = (e as Error)?.message ?? String(e);
          logger?.warn?.({ err: lastError }, 'universe refresh failed');
        })
        .finally(() => {
          finishedAt = new Date().toISOString();
          current = null;
        });
      return { started: true };
    },
    async settle(): Promise<void> {
      await current;
    },
  };
}
