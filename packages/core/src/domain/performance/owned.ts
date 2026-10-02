// packages/core/src/domain/performance/owned.ts
import type { InvestmentTransaction } from '../../types';
import type { FlowTxn } from './replay';
import type { LotOpts, LotTxn } from './lots';
import { isElssCategory, isEquityTaxed } from './amfiNavList';

const isBuy = (t: InvestmentTransaction) => t.transactionType === 'PURCHASE' || t.transactionType === 'SWITCH_IN';
const isSell = (t: InvestmentTransaction) => t.transactionType === 'REDEMPTION' || t.transactionType === 'SWITCH_OUT';

export function txnsToFlows(txns: InvestmentTransaction[]): FlowTxn[] {
  return txns
    .filter((t) => isBuy(t) || isSell(t))
    .map((t) => ({ date: t.transactionDate, type: isBuy(t) ? 'buy' : 'sell', amountInr: t.amount }) as FlowTxn);
}

export function txnsToLots(txns: InvestmentTransaction[]): LotTxn[] {
  return txns
    .filter((t) => isBuy(t) || isSell(t))
    .map((t) => ({ date: t.transactionDate, type: isBuy(t) ? 'buy' : 'sell', units: t.units, nav: t.nav }) as LotTxn);
}

/** Tax options from the AMFI category; falls back to the stored asset class + name when the category is unknown. */
export function taxOptsFor(category: string | null, schemeName: string, assetClass: string | null): LotOpts | null {
  if (category) return { taxRegime: isEquityTaxed(category) ? 'equity' : 'slab', elss: isElssCategory(category) };
  if (assetClass === 'equity') return { taxRegime: 'equity', elss: /\belss\b|tax saver/i.test(schemeName) };
  return null;
}
