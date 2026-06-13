// Investment Services Index
// Exports all investment-related services for easy importing and future MCP integration

// Scheme management
export {
  matchOrCreateScheme,
  findSchemeByName,
  getSchemes,
  getSchemeById,
  updateSchemeAmfiCode,
  type Scheme,
} from './schemeService';

// Portfolio and holdings queries
export {
  getPortfolioSummary,
  getHoldings,
  getAssetAllocation,
  getAccounts,
  type PortfolioSummary,
  type Holding,
  type AssetAllocation,
} from './portfolioService';

// Transaction queries
export {
  getTransactions,
  getTransactionsByScheme,
  getTransactionSummary,
  getCashFlows,
  type InvestmentTransaction,
  type TransactionSummary,
  type TransactionType,
} from './transactionService';

// Re-export from parent directory for convenience
export {
  getPeriodReturns,
  calculateXIRR,
  type Period,
  type PeriodReturns,
} from '../returnsCalculator';

export {
  getLatestNAV,
  getNAVForDate,
  getNAVHistory,
  searchSchemes,
  getSchemeInfo,
  clearCache,
  type NAVData,
  type SchemeInfo,
} from '../navService';

export {
  autoMatchAmfiCodes,
  verifySchemeNAV,
} from '../amfiMatcher';
