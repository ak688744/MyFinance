import type { FundPlanType, MarketCapBucket } from '../../types';

export type OwnedFund = {
  schemeId: number;
  schemeName: string;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  currentValueInr: number;
  planType: FundPlanType | null;
  expenseRatioDirect: number | null;
  expenseRatioRegular: number | null;
  holdings: {
    securityName: string;
    isin: string | null;
    weightPct: number;
    sector: string | null;
    marketCapBucket: MarketCapBucket | null;
  }[];
};
