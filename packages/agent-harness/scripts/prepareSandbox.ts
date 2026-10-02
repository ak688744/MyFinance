import { resolveSandboxPaths } from '../src/sandbox/paths';
import { ensureWheels, wheelsCached } from '../src/sandbox/wheels';

const paths = resolveSandboxPaths();
await ensureWheels(paths);
console.log(wheelsCached(paths) ? `Sandbox wheels ready in ${paths.wheelCache}` : 'Wheels missing');
