import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, rmSync } from 'node:fs';
import { SANDBOX_EXEC, SANDBOX_PROFILE } from '../../src/sandbox/launch';
import { SANDBOX_RUNNABLE, SANDBOX_REQUIRED, testSpec } from './runnable';
import { resolveSandboxPaths } from '../../src/sandbox/paths';
import { startSandbox, MEMORY_MESSAGE, type SandboxHandle } from '../../src/sandbox/sandboxProcess';

const noBridge = async () => { throw new Error('no bridge'); };

describe.runIf(SANDBOX_REQUIRED && !SANDBOX_RUNNABLE)('sandbox isolation (required)', () => {
  it('sandbox must be runnable when MF_REQUIRE_SANDBOX=1', () => {
    throw new Error('MF_REQUIRE_SANDBOX=1 but the sandbox cannot run (needs macOS sandbox-exec and cached wheels: pnpm sandbox:prepare).');
  });
});

describe.skipIf(!SANDBOX_RUNNABLE)('sandbox isolation (probe escape vectors)', () => {
  let sb: SandboxHandle | undefined;
  afterEach(() => { sb?.kill(); sb = undefined; });
  const start = (memCapMb = 512) => startSandbox({ spec: testSpec(), childEntry: resolveSandboxPaths().childEntry, bridge: noBridge, memCapMb, pollMs: 50 });
  const run = (code: string, timeoutMs = 30_000) => sb!.run({ code, datasets: {}, timeoutMs });
  const G = 'import gc, types\n';

  it.each([
    ['import js', 'import js; js.process.pid'],
    ['import pyodide_js', 'import pyodide_js; pyodide_js.version'],
    ['pyodide.code.run_js', 'from pyodide.code import run_js; run_js("1")'],
    ['__import__ js', '__import__("js")'],
    ['importlib js', 'import importlib; importlib.import_module("js")'],
    ['import _mf_bridge', 'import _mf_bridge'],
  ])('blocks %s', async (_name, code) => {
    sb = await start();
    const r = await run(code);
    expect(r.error).toMatch(/blocked in the MyFinance sandbox|ModuleNotFoundError/);
  }, 120_000);

  it('gc path to pyodide.ffi.to_js cannot evaluate JS (codegen disabled)', async () => {
    sb = await start();
    const r = await run(G + 'ffi=[o for o in gc.get_objects() if isinstance(o, types.ModuleType) and o.__name__=="pyodide.ffi"][0]\nffi.to_js([1]).constructor.constructor("return process.pid")()');
    expect(r.error).toMatch(/EvalError|Code generation from strings disallowed/);
  }, 120_000);

  it('the import hook no longer holds js / pyodide_js proxies', async () => {
    sb = await start();
    const r = await run(G + '[dict(o.jsproxies) for o in gc.get_objects() if type(o).__name__=="JsFinder"]');
    expect(r.error).toBeUndefined();
    const finders = r.result as unknown[];
    expect(finders.length).toBeGreaterThanOrEqual(1);
    expect(finders).toEqual(finders.map(() => ({})));
  }, 120_000);

  it('no reachable JS proxy exposes the pyodide API, FS or process', async () => {
    sb = await start();
    const r = await run(G + 'hits=[]\nscanned=0\nfor o in gc.get_objects():\n    if type(o).__name__.startswith("Js"):\n        scanned+=1\n        for a in ("FS","loadPackage","process","getBuiltinModule","_module","mountNodeFS"):\n            try:\n                getattr(o, a); hits.append(a)\n            except Exception:\n                pass\n[hits, scanned]');
    // scanned may legitimately be 0 (proxies to js/pyodide_js were purged); hits must be empty either way.
    const [hits] = r.result as [string[], number];
    expect(r.error).toBeUndefined();
    expect(hits).toEqual([]);
  }, 120_000);

  it('recreating _pyodide_core via BuiltinImporter gives no JS globals', async () => {
    sb = await start();
    const r = await run('import importlib._bootstrap as b, importlib.util as u\nm=b.BuiltinImporter.create_module(u.spec_from_loader("_pyodide_core", b.BuiltinImporter))\n[n for n in dir(m) if n in ("process","globalThis","FS")]');
    expect(r.error).toBeUndefined();
    expect(r.result).toEqual([]);
  }, 120_000);

  it('python sockets cannot reach the network', async () => {
    sb = await start();
    const r = await run('import socket\ns=socket.create_connection(("example.com", 80), timeout=3)\ns.sendall(b"GET / HTTP/1.0\\r\\n\\r\\n")\ns.recv(16)');
    expect(r.error).toBeDefined();
  }, 120_000);

  it('host files are not visible and open() writes stay in memory', async () => {
    sb = await start();
    expect((await run('open("/etc/hosts").read()')).error).toMatch(/No such file|FileNotFoundError/);
    expect((await run('import os; os.path.exists("/Users")')).result).toBe(false);
    rmSync('/tmp/mf-sbx.txt', { force: true });
    expect((await run('open("/tmp/mf-sbx.txt","w").write("x")')).error).toBeUndefined();
    const leaked = existsSync('/tmp/mf-sbx.txt');
    rmSync('/tmp/mf-sbx.txt', { force: true });
    expect(leaked).toBe(false);
  }, 120_000);

  it('the environment carries no host secrets', async () => {
    sb = await start();
    const r = await run('import os\n[sorted(k for k in os.environ if k.startswith(("AWS","MYFINANCE","GEMINI","DB_","OPENAI","ANTHROPIC"))), os.environ.get("HOME", "")]');
    const [secretKeys, home] = r.result as [string[], string];
    expect(secretKeys).toEqual([]);
    expect(home.startsWith('/Users')).toBe(false);
  }, 120_000);

  it('an infinite loop is killed at the timeout and the handle is dead', async () => {
    sb = await start();
    const r = await run('while True: pass', 2_000);
    expect(r.error).toMatch(/Timed out after 2 s/);
    expect(sb.alive).toBe(false);
  }, 120_000);

  it('growth past the memory cap kills the child with the memory message', async () => {
    sb = await start(64);
    const r = await run('import numpy as np\na = np.ones(200_000_000 // 8)\nwhile True: a.sum()');
    expect(r.error).toBe(MEMORY_MESSAGE);
    expect(sb.alive).toBe(false);
  }, 120_000);

  it('normal work under the cap still succeeds', async () => {
    sb = await start(512);
    const r = await run('import numpy as np\na = np.ones(100_000_000 // 8)\nint(a.sum())');
    expect(r.result).toBe(12_500_000);
  }, 120_000);
  it('OS-level network deny: node under the production sandbox profile cannot fetch', async () => {
    const exec = (cmd: string, args: string[]) =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        const c = spawn(cmd, args, { timeout: 20_000 });
        let out = '';
        c.stdout.on('data', (d) => (out += d));
        c.on('close', (code) => resolve({ code, out: out.trim() }));
      });
    const script = (url: string) => `fetch('${url}').then(()=>process.exit(0),e=>{console.log(e.cause&&e.cause.code||e.message);process.exit(3)})`;
    const server = createServer((_q, res) => res.end('ok'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const local = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    try {
      // Control: without the sandbox the local fetch succeeds, so a failure below is caused by the profile.
      expect((await exec(process.execPath, ['-e', script(local)])).code).toBe(0);
      // Same node under the production profile: loopback is denied.
      expect((await exec(SANDBOX_EXEC, ['-p', SANDBOX_PROFILE, process.execPath, '-e', script(local)])).code).toBe(3);
      // And the external host fails too.
      expect((await exec(SANDBOX_EXEC, ['-p', SANDBOX_PROFILE, process.execPath, '-e', script('https://example.com')])).code).toBe(3);
    } finally { server.close(); }
  }, 120_000);
});
