import type { FundDataSource } from '../../types';
import type { FundDataAdapter } from './types';
import { fetchGrowwFundData } from './groww';
import { fetchTickertapeFundData } from './tickertape';
import { fetchKuveraFundData } from './kuvera';

const REGISTRY: Record<FundDataSource, FundDataAdapter> = {
  groww: fetchGrowwFundData,
  tickertape: fetchTickertapeFundData,
  kuvera: fetchKuveraFundData,
};

export function resolveFundDataAdapter(source: FundDataSource): FundDataAdapter {
  const adapter = REGISTRY[source];
  if (!adapter) {
    const err = new Error(`Unsupported fund-data source: ${source}`) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  return adapter;
}
