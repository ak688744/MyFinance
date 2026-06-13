import { valueComputedAsset } from './computed';
import { valueManualAsset } from './manual';
import type {
  Asset,
  AssetContribution,
  AssetRate,
  AssetValuation,
  ValuedAsset,
} from '../../types';

export { compoundContribution, valueComputedAsset } from './computed';
export { valueManualAsset } from './manual';

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
