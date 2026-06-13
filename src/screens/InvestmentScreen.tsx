import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { AccountFilter } from '../components/investment/AccountFilter';
import { AMCGroupCard } from '../components/investment/AMCGroupCard';
import { AssetTypeToggle, AssetType } from '../components/investment/AssetTypeToggle';
import { HoldingCard } from '../components/investment/HoldingCard';
import { InvestmentEmptyState } from '../components/investment/InvestmentEmptyState';
import { PeriodSelector, Period } from '../components/investment/PeriodSelector';
import { PortfolioSummaryCard } from '../components/investment/PortfolioSummaryCard';
import { RedemptionTile } from '../components/investment/RedemptionTile';
import { SortGroupControls, SortBy, GroupBy } from '../components/investment/SortGroupControls';
import {
  getAccounts,
  getHoldings,
  getHoldingsForPeriod,
  getPortfolioSummary,
  getPortfolioSummaryForPeriod,
  getRedemptionsForPeriod,
  Holding,
  PeriodRedemption,
  PortfolioSummary,
} from '../features/investment/services/portfolioService';
import { palette } from '../theme/palette';

type InvestmentScreenProps = {
  onGoToImport: () => void;
};

export function InvestmentScreen({ onGoToImport }: InvestmentScreenProps) {
  const db = useSQLiteContext();

  // Filter state
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<AssetType>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('currentValue');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  // UI state
  const [expandedHoldingId, setExpandedHoldingId] = useState<number | null>(null);
  const [expandedAmcName, setExpandedAmcName] = useState<string | null>(null);
  const [isAccountFilterOpen, setIsAccountFilterOpen] = useState(false);

  // Data state
  const [accounts, setAccounts] = useState<string[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [redemptions, setRedemptions] = useState<PeriodRedemption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isLifetime = selectedPeriod === 'ALL';

  // Fetch accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      const accountsList = await getAccounts(db);
      setAccounts(accountsList);
    }
    fetchAccounts();
  }, [db]);

  // Fetch everything that depends on period / account / filters
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setIsLoading(true);
      try {
        if (isLifetime) {
          const [summary, holdingsList] = await Promise.all([
            getPortfolioSummary(db, { account: selectedAccount ?? undefined }),
            getHoldings(db, {
              account: selectedAccount ?? undefined,
              category: assetType !== 'all' ? assetType : undefined,
              sortBy,
            }),
          ]);
          if (cancelled) return;
          setPortfolioSummary(summary);
          setHoldings(holdingsList);
          setRedemptions([]);
        } else {
          const [summary, holdingsList, redemptionsList] = await Promise.all([
            getPortfolioSummaryForPeriod(db, {
              period: selectedPeriod,
              account: selectedAccount ?? undefined,
            }),
            getHoldingsForPeriod(db, {
              period: selectedPeriod,
              account: selectedAccount ?? undefined,
              category: assetType !== 'all' ? assetType : undefined,
              sortBy,
            }),
            getRedemptionsForPeriod(db, {
              period: selectedPeriod,
              account: selectedAccount ?? undefined,
            }),
          ]);
          if (cancelled) return;
          setPortfolioSummary(summary);
          setHoldings(holdingsList);
          setRedemptions(redemptionsList);
        }
      } catch (error) {
        console.error('[InvestmentScreen] Fetch failed:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [db, selectedAccount, assetType, sortBy, selectedPeriod, isLifetime]);

  // Group holdings by AMC
  const holdingsByAmc = holdings.reduce(
    (acc, holding) => {
      const amc = holding.amcName || 'Other';
      if (!acc[amc]) acc[amc] = [];
      acc[amc].push(holding);
      return acc;
    },
    {} as Record<string, Holding[]>
  );

  // Group holdings by category
  const holdingsByCategory = holdings.reduce(
    (acc, holding) => {
      const category = holding.category || 'other';
      const categoryLabel =
        category === 'equity'
          ? 'Equity'
          : category === 'debt'
            ? 'Debt'
            : category === 'hybrid'
              ? 'Hybrid'
              : 'Other';
      if (!acc[categoryLabel]) acc[categoryLabel] = [];
      acc[categoryLabel].push(holding);
      return acc;
    },
    {} as Record<string, Holding[]>
  );

  const amcTotals = Object.entries(holdingsByAmc).reduce(
    (acc, [amc, amcHoldings]) => {
      acc[amc] = amcHoldings.reduce((sum, h) => sum + h.currentValue, 0);
      return acc;
    },
    {} as Record<string, number>
  );

  const categoryTotals = Object.entries(holdingsByCategory).reduce(
    (acc, [category, categoryHoldings]) => {
      acc[category] = categoryHoldings.reduce((sum, h) => sum + h.currentValue, 0);
      return acc;
    },
    {} as Record<string, number>
  );

  const handleHoldingToggle = (id: number) => {
    setExpandedHoldingId(expandedHoldingId === id ? null : id);
  };

  const handleAmcToggle = (amcName: string) => {
    setExpandedAmcName(expandedAmcName === amcName ? null : amcName);
  };

  const handleAccountFilterToggle = () => {
    setIsAccountFilterOpen(!isAccountFilterOpen);
  };

  const handleAccountSelect = (account: string | null) => {
    setSelectedAccount(account);
  };

  const renderHoldings = () => {
    if (holdings.length === 0 && redemptions.length === 0) {
      return <InvestmentEmptyState onImportPress={onGoToImport} />;
    }

    if (groupBy === 'none') {
      return (
        <View style={styles.holdingsList}>
          {holdings.map((holding) => (
            <HoldingCard
              key={`${holding.id}-${holding.accountName}`}
              holding={holding}
              isExpanded={expandedHoldingId === holding.id}
              onToggle={() => handleHoldingToggle(holding.id)}
            />
          ))}
        </View>
      );
    }

    if (groupBy === 'amc') {
      const sortedAmcs = Object.keys(holdingsByAmc).sort((a, b) => {
        return (amcTotals[b] || 0) - (amcTotals[a] || 0);
      });

      return (
        <View style={styles.holdingsList}>
          {sortedAmcs.map((amc) => (
            <AMCGroupCard
              key={amc}
              amcName={amc}
              holdings={holdingsByAmc[amc]}
              totalValue={amcTotals[amc] || 0}
              isExpanded={expandedAmcName === amc}
              onToggle={() => handleAmcToggle(amc)}
              expandedHoldingId={expandedHoldingId}
              onHoldingToggle={handleHoldingToggle}
            />
          ))}
        </View>
      );
    }

    if (groupBy === 'category') {
      const sortedCategories = Object.keys(holdingsByCategory).sort((a, b) => {
        return (categoryTotals[b] || 0) - (categoryTotals[a] || 0);
      });

      return (
        <View style={styles.holdingsList}>
          {sortedCategories.map((category) => (
            <AMCGroupCard
              key={category}
              amcName={category}
              holdings={holdingsByCategory[category]}
              totalValue={categoryTotals[category] || 0}
              isExpanded={expandedAmcName === category}
              onToggle={() => handleAmcToggle(category)}
              expandedHoldingId={expandedHoldingId}
              onHoldingToggle={handleHoldingToggle}
            />
          ))}
        </View>
      );
    }

    return null;
  };

  const hasAnyData = holdings.length > 0 || redemptions.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Account Filter */}
      <View style={styles.accountFilterContainer}>
        <AccountFilter
          accounts={accounts}
          selected={selectedAccount}
          onSelect={handleAccountSelect}
          isOpen={isAccountFilterOpen}
          onToggle={handleAccountFilterToggle}
        />
      </View>

      {/* Portfolio Summary */}
      {portfolioSummary && portfolioSummary.holdingsCount > 0 && (
        <PortfolioSummaryCard
          currentValue={portfolioSummary.totalCurrentValue}
          investedValue={portfolioSummary.totalInvested}
          returns={portfolioSummary.totalReturns}
          returnsPercent={portfolioSummary.totalReturnsPercent}
          xirr={portfolioSummary.xirr}
          periodLabel={isLifetime ? undefined : `${selectedPeriod} View`}
          redeemedValue={portfolioSummary.totalRedeemed}
          isLoading={isLoading}
        />
      )}

      {/* Asset Type Toggle */}
      {hasAnyData && (
        <AssetTypeToggle selected={assetType} onSelect={setAssetType} />
      )}

      {/* Period Selector */}
      {hasAnyData && (
        <View style={styles.periodSelectorContainer}>
          <PeriodSelector selected={selectedPeriod} onSelect={setSelectedPeriod} />
        </View>
      )}

      {/* Sort & Group Controls */}
      {holdings.length > 0 && (
        <View style={styles.sortGroupContainer}>
          <SortGroupControls
            sortBy={sortBy}
            groupBy={groupBy}
            onSortChange={setSortBy}
            onGroupChange={setGroupBy}
          />
        </View>
      )}

      {/* Holdings List */}
      {renderHoldings()}

      {/* Redemption Tiles — only when period ≠ MAX and there are redemptions */}
      {!isLifetime && redemptions.length > 0 && (
        <View style={styles.redemptionSection}>
          <Text style={styles.redemptionHeader}>Redeemed in this period</Text>
          <View style={styles.holdingsList}>
            {redemptions.map((r) => (
              <RedemptionTile key={`${r.schemeId}-${r.accountName}`} redemption={r} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  accountFilterContainer: {
    zIndex: 20,
  },
  periodSelectorContainer: {
    marginHorizontal: -16,
  },
  sortGroupContainer: {
    zIndex: 10,
  },
  holdingsList: {
    gap: 12,
  },
  redemptionSection: {
    gap: 8,
    marginTop: 4,
  },
  redemptionHeader: {
    color: palette.mutedText,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 4,
  },
});

export default InvestmentScreen;
