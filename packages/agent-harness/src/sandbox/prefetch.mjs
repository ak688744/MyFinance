// Trusted prefetch child: downloads the sandbox wheels into the cache.
// Runs WITHOUT sandbox flags and never executes user code.
const { loadPyodide } = await import(process.env.MF_PYODIDE_ENTRY);
const py = await loadPyodide({ packageCacheDir: process.env.MF_WHEEL_CACHE, stdout: () => {}, stderr: () => {} });
await py.loadPackage(JSON.parse(process.env.MF_PACKAGES), { messageCallback: () => {} });
process.exit(0);
