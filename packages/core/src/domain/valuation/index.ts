import { valueComputedAsset } from './computed.js';
import { valueManualAsset } from './manual.js';
import type {
  Asset,
  AssetContribution,
  AssetRate,
  AssetValuation,
  ValuedAsset,
} from '../../types.js';

export { compoundContribution, valueComputedAsset } from './computed.js';
export { valueManualAsset } from './manual.js';

export type AssetInputs = {
  contributions: AssetContribution[];
  rates: AssetRate[];
  valuations: AssetValuation[];
};

/** Route an asset to its valuation strategy. Pure — inputs pre-loaded. */
export function valueAsset(
  asset: Asset,
  inputs: AssetInputs,
  today: Date = new Date(),
): ValuedAsset {
  if (asset.valuationStrategy === 'computed') {
    return valueComputedAsset(asset, inputs.contributions, inputs.rates, today);
  }
  return valueManualAsset(asset, inputs.valuations, today);
}
