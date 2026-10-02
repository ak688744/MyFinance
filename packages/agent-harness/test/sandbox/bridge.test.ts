import { describe, it, expect } from 'vitest';
import { calculateXIRR, trailingReturn, maxDrawdown, quantiles, replayCashflows } from '@myfinance/core';
import { handleBridgeCall, BRIDGE_FUNCTION_NAMES, BRIDGE_DOCS } from '../../src/sandbox/bridge';
import { SANDBOX_RUNNABLE, testSpec } from './runnable';
import { resolveSandboxPaths } from '../../src/sandbox/paths';
import { startSandbox } from '../../src/sandbox/sandboxProcess';

const call = async (fn: string, ...args: unknown[]) => JSON.parse(await handleBridgeCall(fn, JSON.stringify(args)));
const series = [
  { date: '2021-01-29', nav: 100 }, { date: '2022-01-31', nav: 110 },
  { date: '2023-01-31', nav: 99 }, { date: '2024-01-31', nav: 130 },
];

describe('handleBridgeCall', () => {
  it('returns exactly what the TypeScript calculators return', async () => {
    const flows = [{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 1100 }];
    expect(await call('xirr', flows)).toBe(calculateXIRR(flows));
    expect(await call('trailing_return', series, '2024-01-31', 3)).toBe(trailingReturn(series, '2024-01-31', 3));
    expect(await call('max_drawdown', series, '2021-01-29', '2024-01-31')).toBe(maxDrawdown(series, '2021-01-29', '2024-01-31'));
    expect(await call('quantiles', [1, 2, 3, 4])).toEqual(quantiles([1, 2, 3, 4]));
    const buys = [{ date: '2021-01-29', type: 'buy', amountInr: 1000 }];
    expect(await call('replay_cashflows', buys, series, '2024-01-31', 1300))
      .toEqual(JSON.parse(JSON.stringify(replayCashflows(buys as never, series, '2024-01-31', 1300))));
  });
  it('rejects malformed arguments with the function name in the message', async () => {
    await expect(handleBridgeCall('trailing_return', JSON.stringify([[{ date: 1 }], '2024-01-31', 3]))).rejects.toThrow(/myfinance.trailing_return/);
    await expect(handleBridgeCall('xirr', '{not json')).rejects.toThrow(/myfinance.xirr/);
  });
  it('rejects unknown functions', async () => {
    await expect(handleBridgeCall('eval', '[]')).rejects.toThrow(/unknown function/);
    await expect(handleBridgeCall('constructor', '[]')).rejects.toThrow(/unknown function/);
  });
  it('documents every function', () => {
    for (const n of BRIDGE_FUNCTION_NAMES) expect(BRIDGE_DOCS).toContain(`${n}(`);
  });
});

describe.skipIf(!SANDBOX_RUNNABLE)('bridge through Pyodide', () => {
  it('a Python call returns the same value as the TypeScript function', async () => {
    const sb = await startSandbox({ spec: testSpec([...BRIDGE_FUNCTION_NAMES]), childEntry: resolveSandboxPaths().childEntry, bridge: handleBridgeCall });
    try {
      const r = await sb.run({ code: `import myfinance\nawait myfinance.trailing_return(${JSON.stringify(series)}, "2024-01-31", 3)`, datasets: {}, timeoutMs: 30_000 });
      expect(r.error).toBeUndefined();
      expect(r.result).toBe(trailingReturn(series, '2024-01-31', 3));
    } finally { sb.kill(); }
  }, 120_000);
});
