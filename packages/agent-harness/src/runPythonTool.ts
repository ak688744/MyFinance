import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BRIDGE_DOCS, type SandboxRuntime } from './sandbox';

export const RUN_PYTHON_TOOL_NAME = 'run_python';
export const MAX_DATASETS = 8;
export const OUTPUT_LIMIT = 20_480;
export const MAX_DATASET_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_DATASET_BYTES = 20 * 1024 * 1024;

export type DatasetResolver = (name: string) => Promise<unknown>;
export type RunPythonOutput = { stdout: string; result: unknown; error?: string; durationMs: number };

// Security-relevant allowlist: only these shapes may ever become a file name in the sandbox.
const NAME_RE = /^(nav:\d{3,8}|transactions:\d{1,9}|universe_stats|category_stats|fact_sheet)$/;

export function datasetFileName(name: string): string | null {
  return NAME_RE.test(name) ? `${name.replace(':', '_')}.json` : null;
}

const inputSchema = z.object({
  code: z.string().min(1).max(20_000),
  datasets: z.array(z.string()).default([]),
});
const outputSchema = z.object({
  stdout: z.string(),
  result: z.unknown(),
  error: z.string().optional(),
  durationMs: z.number(),
});

const cap = (s: string) => (s.length > OUTPUT_LIMIT ? `${s.slice(0, OUTPUT_LIMIT)}...[truncated]` : s);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const capResult = (r: unknown): unknown => {
  try {
    const n = JSON.stringify(r)?.length ?? 0;
    return n > OUTPUT_LIMIT ? `[result truncated: ${n} chars]` : r;
  } catch {
    return '[result not serializable]';
  }
};
const fail = (error: string): RunPythonOutput => ({ stdout: '', result: null, error: cap(error), durationMs: 0 });

type Deps = { threadId: string; sandbox: SandboxRuntime; resolveDataset: DatasetResolver };

export async function runPython(o: Deps, input: { code: string; datasets?: string[] }): Promise<RunPythonOutput> {
  const names = [...new Set(input.datasets ?? [])];
  if (names.length > MAX_DATASETS) return fail(`At most ${MAX_DATASETS} datasets per call.`);
  const files: Record<string, string> = {};
  let total = 0;
  for (const name of names) {
    const file = datasetFileName(name);
    if (!file) return fail(`Unknown dataset name "${name}". Use nav:<amfiCode>, transactions:<schemeId>, universe_stats, category_stats or fact_sheet.`);
    try {
      const json: string | undefined = JSON.stringify(await o.resolveDataset(name));
      if (typeof json !== 'string') return fail(`Dataset ${name}: resolver returned no data`);
      const bytes = Buffer.byteLength(json);
      if (bytes > MAX_DATASET_BYTES) return fail(`Dataset ${name} is too large (${bytes} bytes, max ${MAX_DATASET_BYTES}). Use monthly data or fewer datasets.`);
      total += bytes;
      if (total > MAX_TOTAL_DATASET_BYTES) return fail(`Datasets exceed the total limit of ${MAX_TOTAL_DATASET_BYTES} bytes. Use monthly data or fewer datasets.`);
      files[file] = json;
    } catch (e) {
      return fail(`Dataset ${name}: ${msg(e)}`);
    }
  }
  try {
    const r = await o.sandbox.run(o.threadId, { code: input.code, datasets: files });
    return { stdout: cap(r.stdout), result: capResult(r.result), ...(r.error ? { error: cap(r.error) } : {}), durationMs: r.durationMs };
  } catch (e) {
    return fail(`The Python sandbox failed: ${msg(e)}`);
  }
}

const DESCRIPTION = `Run Python 3 (numpy, pandas) in an isolated sandbox with no network and no file access beyond /data. Use only when the other investment tools cannot answer (custom windows, what-ifs, comparing several series).
Datasets (pass names in "datasets"; each is written as JSON to /data/<name with ":" replaced by "_">.json):
- nav:<amfiCode> -> /data/nav_<code>.json {"code","frequency":"daily"|"monthly","points":[{"date","nav"}]}
- transactions:<schemeId> -> /data/transactions_<id>.json {"schemeId","schemeName","amfiCode","transactions":[{"date","type","units","nav","amountInr"}]}
- universe_stats -> /data/universe_stats.json (every universe fund with its performance stats)
- category_stats -> /data/category_stats.json (p25/median/p75 per category and metric)
- fact_sheet -> /data/fact_sheet.json (the portfolio review fact sheet)
Deterministic calculators (use these instead of re-implementing; call with await):
${BRIDGE_DOCS}
Variables persist between calls in the same chat. The value of the last expression is returned as "result" (keep it small and JSON-friendly); print() output is "stdout". Limits: 30 s, 512 MB, 20 KB output.`;

export function buildRunPythonTool(o: Deps): Record<string, unknown> {
  const tool = createTool({
    id: RUN_PYTHON_TOOL_NAME,
    description: DESCRIPTION,
    inputSchema,
    outputSchema,
    execute: async (input: z.infer<typeof inputSchema>) => runPython(o, input),
  });
  return { [RUN_PYTHON_TOOL_NAME]: tool };
}
