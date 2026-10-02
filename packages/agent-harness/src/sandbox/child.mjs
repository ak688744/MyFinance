// Hardened Pyodide sandbox child (spec section 9). Plain JS on purpose: it runs under
// --permission with read access only to the pyodide package, the wheel cache and
// this file, so it cannot load tsx. Do not import anything else here.
import fs from 'node:fs';
import os from 'node:os';

// Pyodide's NODEFS.staticInit calls process.binding('constants'), which --permission denies.
{
  const orig = process.binding;
  process.binding = (name) => (name === 'constants' ? { fs: fs.constants, os: os.constants } : orig.call(process, name));
}

const OUTPUT_LIMIT = 20480;
const BRIDGE_NAMES = JSON.parse(process.env.MF_BRIDGE_FUNCTIONS);
const send = (m) => { if (process.connected) process.send(m); };
const disabled = () => { throw new Error('disabled in the MyFinance sandbox'); };

const { loadPyodide } = await import(process.env.MF_PYODIDE_ENTRY);
const py = await loadPyodide({
  packageCacheDir: process.env.MF_WHEEL_CACHE,
  jsglobals: Object.create(null),
  stdout: () => {},
  stderr: () => {},
});
await py.loadPackage(['numpy', 'pandas'], { messageCallback: () => {}, errorCallback: () => {} });

// Output capture, capped so a runaway print loop cannot exhaust memory or the IPC channel.
let out = '';
const capture = (s) => { if (out.length < OUTPUT_LIMIT + 1) out = (out + s + '\n').slice(0, OUTPUT_LIMIT + 1); };
py.setStdout({ batched: capture });
py.setStderr({ batched: capture });

// Bridge stub: each call is an IPC round trip to the host's TypeScript calculators.
let seq = 0;
const waiting = new Map();
const rawBridge = Object.create(null);
for (const fn of BRIDGE_NAMES) {
  rawBridge[fn] = (argsJson) => new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    send({ type: 'bridge', seq: id, fn, argsJson: String(argsJson) });
  });
}
Object.freeze(rawBridge);
py.registerJsModule('_mf_bridge', rawBridge);

// Result serialiser lives in a private namespace that user code cannot reach.
const helperNs = py.pyimport('builtins').dict();
py.runPython(`
import json
def _mf_default(o):
    for attr in ('tolist', 'item'):
        f = getattr(o, attr, None)
        if callable(f):
            try:
                return f()
            except Exception:
                pass
    to_dict = getattr(o, 'to_dict', None)
    if callable(to_dict):
        try:
            return to_dict()
        except Exception:
            pass
    return repr(o)
def _mf_to_json(o):
    try:
        return json.dumps(o, default=_mf_default, allow_nan=False)
    except (TypeError, ValueError):
        return json.dumps(repr(o))
`, { globals: helperNs });
const toJson = helperNs.get('_mf_to_json');

const runAsync = py.runPythonAsync.bind(py);
const FS = py.FS;

// Python-side hardening: build the myfinance module, then strip every JS proxy route.
// Runs in a private globals dict so the helper closures keep their names while user
// code (which runs in __main__) never sees them.
const hardenNs = py.pyimport('builtins').dict();
await runAsync(`
import sys, gc, types, json as _json
import _mf_bridge as _raw
def _mf_arg_default(o):
    for attr in ('tolist', 'item'):
        f = getattr(o, attr, None)
        if callable(f):
            return f()
    return repr(o)
_mod = types.ModuleType('myfinance', 'MyFinance calculators, computed by the host in TypeScript.')
def _make(name):
    raw = getattr(_raw, name)
    async def fn(*args):
        return _json.loads(await raw(_json.dumps(list(args), default=_mf_arg_default)))
    fn.__name__ = name
    return fn
for _n in ${JSON.stringify(BRIDGE_NAMES)}:
    setattr(_mod, _n, _make(_n))
sys.modules['myfinance'] = _mod
for _f in list(sys.meta_path):
    if type(_f).__name__ == 'JsFinder':
        _f.jsproxies.clear()
        sys.meta_path.remove(_f)
class _Block:
    BLOCKED = ('js', 'pyodide_js', 'pyodide', '_pyodide', '_pyodide_core', 'micropip', 'pyodide_http', '_mf_bridge')
    def find_spec(self, name, path=None, target=None):
        if name.split('.')[0] in self.BLOCKED:
            raise ImportError(f"module {name!r} is blocked in the MyFinance sandbox")
        return None
for _m in list(sys.modules):
    if _m.split('.')[0] in _Block.BLOCKED:
        del sys.modules[_m]
sys.meta_path.insert(0, _Block())
gc.collect()
_left = [f for f in sys.meta_path if type(f).__name__ == 'JsFinder']
_left += [o for o in gc.get_objects() if type(o).__name__ == 'JsFinder' and len(o.jsproxies) > 0]
if _left:
    raise RuntimeError('sandbox hardening failed: JsFinder still reachable')
`, { globals: hardenNs });

// JS-side hardening: no host-reaching API is left callable.
for (const k of ['loadPackage', 'loadPackagesFromImports', 'mountNodeFS', 'mountNativeFS', 'registerJsModule',
  'unregisterJsModule', 'pyimport', 'runPython', 'runPythonAsync', 'setStdout', 'setStderr', 'setStdin']) {
  try { py[k] = disabled; } catch {}
}
try { FS.mount = disabled; } catch {}

// Memory cap is enforced by the host (sandboxProcess.ts): a timer here cannot fire while WASM runs.

const capJson = (j) => (j.length > OUTPUT_LIMIT * 2 ? JSON.stringify(j.slice(0, OUTPUT_LIMIT + 1)) : j);
const resultJson = (r) => capJson(resultJsonRaw(r));
const resultJsonRaw = (r) => {
  if (r === undefined || r === null) return 'null';
  if ((typeof r === 'object' || typeof r === 'function') && typeof r.toJs === 'function') {
    try { return toJson(r); } finally { try { r.destroy(); } catch {} }
  }
  try { return JSON.stringify(r) ?? 'null'; } catch { return JSON.stringify(String(r)); }
};

process.on('message', async (m) => {
  if (m?.type === 'bridge-reply') {
    const w = waiting.get(m.seq);
    waiting.delete(m.seq);
    if (w) (m.ok ? w.resolve(m.valueJson) : w.reject(new Error(m.error)));
    return;
  }
  if (m?.type !== 'run') return;
  out = '';
  const started = Date.now();
  try {
    try { for (const f of FS.readdir('/data')) if (f.endsWith('.json')) FS.unlink(`/data/${f}`); } catch {}
    for (const [file, content] of Object.entries(m.datasets ?? {})) {
      if (!/^[a-z0-9_]+\.json$/.test(file)) throw new Error(`invalid dataset file name ${file}`);
      try { FS.mkdir('/data'); } catch {}
      FS.writeFile(`/data/${file}`, content);
    }
    const r = await runAsync(m.code);
    send({ type: 'result', id: m.id, stdout: out, resultJson: resultJson(r), durationMs: Date.now() - started });
  } catch (e) {
    const msg = String(e?.message ?? e);
    send({ type: 'result', id: m.id, stdout: out, resultJson: 'null', error: msg.slice(-4000), durationMs: Date.now() - started });
  }
});

// If the host goes away, do not linger as an orphan.
process.on('disconnect', () => process.exit(0));

send({ type: 'ready' });
