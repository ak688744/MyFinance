import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { presentTransaction } from '../features/transactions/presentTransaction';
import { palette } from '../theme/palette';

type TransactionPreview = {
  id: number;
  transaction_date: string;
  description: string;
  amount: number;
  direction: 'debit' | 'credit';
  category_id: string | null;
  merchant_key: string | null;
  upi_note_keyword: string | null;
};

type CategoryRecord = {
  id: string;
  name: string;
  icon: string | null;
};

type TransactionFilter = {
  id: string;
  name: string;
};

type CategoryInsight = {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  transactionCount: number;
};

type TimePeriod = '7d' | '30d' | 'prev_month' | 'custom';

type CustomDateRange = {
  start: Date;
  end: Date;
};

type FinancesScreenProps = {
  allTransactions: TransactionPreview[];
  categories: CategoryRecord[];
  categoryNameById: Record<string, string>;
  filteredTransactions: TransactionPreview[];
  displayedTransactions: TransactionPreview[];
  selectedFilter: string;
  selectedFilterName: string;
  selectedCategoryTotal: number | null;
  directionFilter: 'debit' | 'credit';
  debitTotal: number;
  creditTotal: number;
  transactionFilters: TransactionFilter[];
  editingTransactionId: number | null;
  showAllTransactions: boolean;
  isCategoryFilterOpen: boolean;
  timePeriod: TimePeriod;
  timePeriodLabels: Record<TimePeriod, string>;
  timePeriods: readonly TimePeriod[];
  categoryInsights: CategoryInsight[];
  monthlyAverage: number;
  highestCategory: CategoryInsight | null;
  onToggleDirectionFilter: (direction: 'debit' | 'credit') => void;
  onSelectFilter: (filterId: string) => void;
  onToggleCategoryFilter: () => void;
  onGoToImport: () => void;
  onToggleTransactionEdit: (transactionId: number) => void;
  onCategoryUpdate: (
    transaction: TransactionPreview,
    categoryId: string | null
  ) => void;
  onToggleShowAllTransactions: () => void;
  onSelectTimePeriod: (period: TimePeriod) => void;
  isCustomPickerOpen: boolean;
  customDateRange: CustomDateRange | null;
  onCloseCustomPicker: () => void;
  onApplyCustomRange: (range: CustomDateRange) => void;
};

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCompactCurrency(amount: number) {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`;
  }
  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return `₹${amount.toFixed(0)}`;
}

function formatDisplayDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function FinancesScreen({
  categories,
  categoryNameById,
  filteredTransactions,
  displayedTransactions,
  selectedFilter,
  selectedFilterName,
  selectedCategoryTotal,
  directionFilter,
  debitTotal,
  creditTotal,
  transactionFilters,
  editingTransactionId,
  showAllTransactions,
  isCategoryFilterOpen,
  timePeriod,
  timePeriodLabels,
  timePeriods,
  categoryInsights,
  monthlyAverage,
  highestCategory,
  onToggleDirectionFilter,
  onSelectFilter,
  onToggleCategoryFilter,
  onGoToImport,
  onToggleTransactionEdit,
  onCategoryUpdate,
  onToggleShowAllTransactions,
  onSelectTimePeriod,
  isCustomPickerOpen,
  customDateRange,
  onCloseCustomPicker,
  onApplyCustomRange,
}: FinancesScreenProps) {
  // Local state for date picker
  const [tempStartDate, setTempStartDate] = useState<Date>(
    customDateRange?.start ?? new Date(Date.now() - 89 * 24 * 60 * 60 * 1000)
  );
  const [tempEndDate, setTempEndDate] = useState<Date>(
    customDateRange?.end ?? new Date()
  );
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Quick select presets for custom picker
  const applyQuickSelect = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    setTempStartDate(start);
    setTempEndDate(end);
    onApplyCustomRange({ start, end });
  };

  const applyCurrentQuarter = () => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), quarter * 3, 1);
    const end = new Date();
    setTempStartDate(start);
    setTempEndDate(end);
    onApplyCustomRange({ start, end });
  };

  const applyFullYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date();
    setTempStartDate(start);
    setTempEndDate(end);
    onApplyCustomRange({ start, end });
  };

  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleStartDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setTempStartDate(selectedDate);
    }
  };

  const handleEndDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setTempEndDate(selectedDate);
    }
  };

  const handleApplyRange = () => {
    onApplyCustomRange({ start: tempStartDate, end: tempEndDate });
  };
  const savingsRate =
    creditTotal > 0
      ? Math.round(((creditTotal - debitTotal) / creditTotal) * 100)
      : 0;

  return (
    <>
      {/* Time Period Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timePeriodRow}
      >
        {timePeriods.map((period) => {
          const isSelected = timePeriod === period;
          return (
            <Pressable
              key={period}
              onPress={() => onSelectTimePeriod(period)}
              style={[
                styles.timePeriodPill,
                isSelected && styles.timePeriodPillSelected,
              ]}
            >
              <Text
                style={[
                  styles.timePeriodText,
                  isSelected && styles.timePeriodTextSelected,
                ]}
              >
                {timePeriodLabels[period]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Direction Toggle */}
      <View style={styles.directionToggleRow}>
        <Pressable
          onPress={() => onToggleDirectionFilter('debit')}
          style={[
            styles.directionToggle,
            directionFilter === 'debit' && styles.directionToggleActive,
          ]}
        >
          <Text
            style={[
              styles.directionToggleText,
              directionFilter === 'debit' && styles.directionToggleTextActive,
            ]}
          >
            Expenses
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onToggleDirectionFilter('credit')}
          style={[
            styles.directionToggle,
            directionFilter === 'credit' && styles.directionToggleActive,
          ]}
        >
          <Text
            style={[
              styles.directionToggleText,
              directionFilter === 'credit' && styles.directionToggleTextActive,
            ]}
          >
            Income
          </Text>
        </Pressable>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryMainRow}>
          <View>
            <Text style={styles.summaryLabel}>
              {directionFilter === 'debit' ? 'TOTAL EXPENSES' : 'TOTAL INCOME'}
            </Text>
            <Text
              style={[
                styles.summaryValue,
                directionFilter === 'debit' ? styles.debitText : styles.creditText,
              ]}
            >
              {formatCurrency(directionFilter === 'debit' ? debitTotal : creditTotal)}
            </Text>
          </View>
          <View style={styles.summarySecondary}>
            <Text style={styles.summarySecondaryLabel}>
              {directionFilter === 'debit' ? 'Income' : 'Expenses'}
            </Text>
            <Text style={styles.summarySecondaryValue}>
              {formatCurrency(directionFilter === 'debit' ? creditTotal : debitTotal)}
            </Text>
          </View>
        </View>
        <View style={styles.summaryMeter}>
          <View
            style={[
              styles.summaryMeterFill,
              directionFilter === 'debit' ? styles.debitMeter : styles.creditMeter,
              {
                width: `${
                  debitTotal + creditTotal === 0
                    ? 0
                    : Math.min(
                        100,
                        ((directionFilter === 'debit' ? debitTotal : creditTotal) /
                          (debitTotal + creditTotal)) *
                          100
                      )
                }%`,
              },
            ]}
          />
        </View>
        {directionFilter === 'debit' && (
          <View style={styles.summarySubRow}>
            <Text style={styles.summarySubLabel}>Savings Rate</Text>
            <Text
              style={[
                styles.summarySubValue,
                savingsRate >= 0 ? styles.creditText : styles.debitText,
              ]}
            >
              {savingsRate}%
            </Text>
          </View>
        )}
      </View>

      {/* Insights Section */}
      <View style={styles.insightsSection}>
        <Text style={styles.sectionTitle}>Insights</Text>
        <View style={styles.insightsRow}>
          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>MONTHLY AVG.</Text>
            <Text style={styles.insightValue}>
              {formatCompactCurrency(monthlyAverage)}
            </Text>
            <Text style={styles.insightSubtext}>projected spend</Text>
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>HIGHEST EXPENSE</Text>
            <Text style={styles.insightValue}>
              {highestCategory ? formatCompactCurrency(highestCategory.amount) : '—'}
            </Text>
            <Text style={styles.insightSubtext}>
              {highestCategory?.categoryName ?? 'No data'}
            </Text>
          </View>
        </View>
      </View>

      {/* Category Insights Section */}
      {categoryInsights.length > 0 ? (
        <View style={styles.categorySection}>
          <View style={styles.categoryHeader}>
            <Text style={styles.sectionTitle}>
              {directionFilter === 'debit' ? 'Expense' : 'Income'} Categories
            </Text>
            <Pressable onPress={onToggleCategoryFilter}>
              <Text style={styles.categoryFilterButton}>
                {selectedFilter === 'all' ? 'All' : selectedFilterName} ▾
              </Text>
            </Pressable>
          </View>

          {isCategoryFilterOpen ? (
            <View style={styles.dropdownMenu}>
              {transactionFilters.map((filter) => (
                <Pressable
                  key={filter.id}
                  onPress={() => onSelectFilter(filter.id)}
                  style={[
                    styles.dropdownOption,
                    selectedFilter === filter.id && styles.dropdownOptionSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      selectedFilter === filter.id &&
                        styles.dropdownOptionTextSelected,
                    ]}
                  >
                    {filter.id === 'all' ? 'All Categories' : filter.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryTilesRow}
          >
            {categoryInsights.map((insight) => (
              <Pressable
                key={insight.categoryId}
                onPress={() => onSelectFilter(insight.categoryId)}
                style={[
                  styles.categoryTile,
                  selectedFilter === insight.categoryId && styles.categoryTileSelected,
                ]}
              >
                <Text style={styles.categoryTilePercent}>
                  {insight.percentage.toFixed(0)}%
                </Text>
                <Text style={styles.categoryTileName} numberOfLines={1}>
                  {insight.categoryName}
                </Text>
                <Text style={styles.categoryTileAmount}>
                  {formatCompactCurrency(insight.amount)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {selectedFilter !== 'all' && selectedCategoryTotal !== null ? (
            <View style={styles.focusBanner}>
              <Text style={styles.focusLabel}>
                Focus: {selectedFilterName}
              </Text>
              <Text style={styles.focusValue}>
                {formatCurrency(selectedCategoryTotal)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Recent Transactions */}
      <View style={styles.transactionsHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <Text style={styles.transactionCount}>
          {filteredTransactions.length} total
        </Text>
      </View>

      {displayedTransactions.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconBadge}>
            <Text style={styles.emptyIcon}>↑</Text>
          </View>
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptyBody}>
            Import your HDFC bank statement to get started
          </Text>
          <Pressable onPress={onGoToImport} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go to Import</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {displayedTransactions.map((transaction) => {
            const presentation = presentTransaction({
              description: transaction.description,
              merchantKey: transaction.merchant_key,
              upiNoteKeyword: transaction.upi_note_keyword,
            });
            const isDebit = transaction.direction === 'debit';

            return (
              <View key={`txn-${transaction.id}`} style={styles.transactionCard}>
                <View style={styles.transactionTopRow}>
                  <View
                    style={[
                      styles.transactionAccent,
                      isDebit ? styles.debitAccent : styles.creditAccent,
                    ]}
                  />
                  <View style={styles.transactionContent}>
                    <Text style={styles.transactionMerchant} numberOfLines={1}>
                      {presentation.merchantLabel}
                    </Text>
                    {presentation.noteLabel ? (
                      <Text style={styles.transactionNote} numberOfLines={1}>
                        {presentation.noteLabel}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.transactionAmountBlock}>
                    <Text
                      style={[
                        styles.transactionAmount,
                        isDebit ? styles.debitText : styles.creditText,
                      ]}
                    >
                      {isDebit ? '-' : '+'}
                      {formatCurrency(transaction.amount)}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDisplayDate(transaction.transaction_date)}
                    </Text>
                  </View>
                </View>

                <View style={styles.transactionFooter}>
                  <Pressable
                    onPress={() => onToggleTransactionEdit(transaction.id)}
                    style={styles.categoryTag}
                  >
                    <Text style={styles.categoryTagIcon}>✎</Text>
                    <Text style={styles.categoryTagText}>
                      {transaction.category_id
                        ? categoryNameById[transaction.category_id] ??
                          transaction.category_id
                        : 'Uncategorized'}
                    </Text>
                  </Pressable>
                </View>

                {editingTransactionId === transaction.id ? (
                  <View style={styles.inlineDropdown}>
                    <Pressable
                      onPress={() => onCategoryUpdate(transaction, null)}
                      style={styles.dropdownOption}
                    >
                      <Text style={styles.dropdownOptionText}>Uncategorized</Text>
                    </Pressable>
                    {categories.map((category) => (
                      <Pressable
                        key={`${transaction.id}-${category.id}`}
                        onPress={() => onCategoryUpdate(transaction, category.id)}
                        style={[
                          styles.dropdownOption,
                          transaction.category_id === category.id &&
                            styles.dropdownOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            transaction.category_id === category.id &&
                              styles.dropdownOptionTextSelected,
                          ]}
                        >
                          {category.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}

      {filteredTransactions.length > 8 ? (
        <Pressable
          onPress={onToggleShowAllTransactions}
          style={styles.outlineButton}
        >
          <Text style={styles.outlineButtonText}>
            {showAllTransactions
              ? 'Show Less'
              : `Show All (${filteredTransactions.length - 8} more)`}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.syncRow}>
        <View style={styles.syncDot} />
        <Text style={styles.syncText}>Local DB Synced</Text>
      </View>

      {/* Custom Date Range Picker Modal */}
      <Modal
        visible={isCustomPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={onCloseCustomPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Custom Range</Text>
              <Pressable onPress={onCloseCustomPicker} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            {/* Date Selection Fields */}
            <View style={styles.dateRangeDisplay}>
              <Pressable
                style={styles.dateFieldTappable}
                onPress={() => setShowStartPicker(true)}
              >
                <Text style={styles.dateFieldLabel}>START DATE</Text>
                <Text style={styles.dateFieldValue}>
                  {formatDateShort(tempStartDate)}
                </Text>
              </Pressable>
              <Text style={styles.dateRangeSeparator}>→</Text>
              <Pressable
                style={styles.dateFieldTappable}
                onPress={() => setShowEndPicker(true)}
              >
                <Text style={styles.dateFieldLabel}>END DATE</Text>
                <Text style={styles.dateFieldValue}>
                  {formatDateShort(tempEndDate)}
                </Text>
              </Pressable>
            </View>

            {/* Native Date Pickers */}
            {showStartPicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={tempStartDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleStartDateChange}
                  maximumDate={tempEndDate}
                />
                {Platform.OS === 'ios' && (
                  <Pressable
                    style={styles.pickerDoneButton}
                    onPress={() => setShowStartPicker(false)}
                  >
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {showEndPicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={tempEndDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleEndDateChange}
                  minimumDate={tempStartDate}
                  maximumDate={new Date()}
                />
                {Platform.OS === 'ios' && (
                  <Pressable
                    style={styles.pickerDoneButton}
                    onPress={() => setShowEndPicker(false)}
                  >
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Apply Button */}
            <Pressable style={styles.applyButton} onPress={handleApplyRange}>
              <Text style={styles.applyButtonText}>Apply Range</Text>
            </Pressable>

            {/* Quick Select Options */}
            <Text style={styles.quickSelectLabel}>QUICK SELECT</Text>
            <View style={styles.quickSelectGrid}>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => applyQuickSelect(14)}
              >
                <Text style={styles.quickSelectText}>Last 14 Days</Text>
              </Pressable>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => applyQuickSelect(90)}
              >
                <Text style={styles.quickSelectText}>Last 90 Days</Text>
              </Pressable>
              <Pressable
                style={styles.quickSelectButton}
                onPress={applyCurrentQuarter}
              >
                <Text style={styles.quickSelectText}>Current Quarter</Text>
              </Pressable>
              <Pressable
                style={styles.quickSelectButton}
                onPress={applyFullYear}
              >
                <Text style={styles.quickSelectText}>Full Year</Text>
              </Pressable>
            </View>

            {/* Extended Options */}
            <Text style={styles.quickSelectLabel}>MORE OPTIONS</Text>
            <View style={styles.quickSelectGrid}>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => applyQuickSelect(180)}
              >
                <Text style={styles.quickSelectText}>6 Months</Text>
              </Pressable>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => applyQuickSelect(365)}
              >
                <Text style={styles.quickSelectText}>1 Year</Text>
              </Pressable>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => applyQuickSelect(730)}
              >
                <Text style={styles.quickSelectText}>2 Years</Text>
              </Pressable>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => {
                  const start = new Date(2000, 0, 1);
                  const end = new Date();
                  setTempStartDate(start);
                  setTempEndDate(end);
                  onApplyCustomRange({ start, end });
                }}
              >
                <Text style={styles.quickSelectText}>All Time</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Time Period Selector
  timePeriodRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  timePeriodPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: palette.surfaceContainerLow,
  },
  timePeriodPillSelected: {
    backgroundColor: palette.accent,
  },
  timePeriodText: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.mutedText,
  },
  timePeriodTextSelected: {
    color: palette.surface,
    fontWeight: '600',
  },

  // Direction Toggle
  directionToggleRow: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    padding: 4,
  },
  directionToggle: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  directionToggleActive: {
    backgroundColor: palette.surface,
  },
  directionToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.mutedText,
  },
  directionToggleTextActive: {
    color: palette.primaryText,
    fontWeight: '600',
  },

  // Summary Card
  summaryCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  summaryMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summarySecondary: {
    alignItems: 'flex-end',
  },
  summarySecondaryLabel: {
    fontSize: 11,
    color: palette.mutedText,
    marginBottom: 2,
  },
  summarySecondaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.mutedText,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '600',
    color: palette.primaryText,
  },
  summaryMeter: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.mutedSurface,
    overflow: 'hidden',
  },
  summaryMeterFill: {
    height: '100%',
    borderRadius: 2,
  },
  debitMeter: {
    backgroundColor: palette.danger,
  },
  creditMeter: {
    backgroundColor: palette.success,
  },
  summarySubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summarySubLabel: {
    fontSize: 11,
    color: palette.mutedText,
  },
  summarySubValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  debitText: {
    color: palette.danger,
  },
  creditText: {
    color: palette.success,
  },

  // Insights Section
  insightsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  insightsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  insightCard: {
    flex: 1,
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  insightLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.mutedText,
  },
  insightValue: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.accent,
  },
  insightSubtext: {
    fontSize: 12,
    color: palette.mutedText,
  },

  // Category Insights
  categorySection: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryFilterButton: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.accent,
  },
  categoryTilesRow: {
    gap: 10,
    paddingVertical: 4,
  },
  categoryTile: {
    width: 100,
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  categoryTileSelected: {
    backgroundColor: palette.accentSoftMuted,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  categoryTilePercent: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.accent,
  },
  categoryTileName: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  categoryTileAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.secondaryText,
  },
  focusBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: palette.accentSoftMuted,
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  focusLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: palette.secondaryText,
  },
  focusValue: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.accent,
  },

  // Dropdown
  dropdownMenu: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  dropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  dropdownOptionSelected: {
    backgroundColor: palette.accentSoftMuted,
  },
  dropdownOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },
  dropdownOptionTextSelected: {
    color: palette.accent,
    fontWeight: '600',
  },

  // Transactions Header
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  transactionCount: {
    fontSize: 12,
    color: palette.mutedText,
  },

  // Empty State
  emptyCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentSoftMuted,
    marginBottom: 6,
  },
  emptyIcon: {
    fontSize: 20,
    color: palette.accent,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  emptyBody: {
    fontSize: 12,
    color: palette.mutedText,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.surface,
  },

  // Transaction Cards
  transactionCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 14,
  },
  transactionTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  transactionAccent: {
    width: 4,
    height: 40,
    borderRadius: 2,
  },
  debitAccent: {
    backgroundColor: palette.danger,
  },
  creditAccent: {
    backgroundColor: palette.success,
  },
  transactionContent: {
    flex: 1,
    gap: 2,
  },
  transactionMerchant: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },
  transactionNote: {
    fontSize: 12,
    color: palette.mutedText,
  },
  transactionAmountBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  transactionDate: {
    fontSize: 12,
    color: palette.mutedText,
  },
  transactionFooter: {
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  categoryTagIcon: {
    fontSize: 11,
    color: palette.mutedText,
  },
  categoryTagText: {
    fontSize: 12,
    fontWeight: '500',
    color: palette.primaryText,
  },
  inlineDropdown: {
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 8,
  },

  // Outline Button
  outlineButton: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  outlineButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },

  // Sync Row
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    opacity: 0.7,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.success,
  },
  syncText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.mutedText,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: palette.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.primaryText,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: palette.mutedText,
  },
  dateRangeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 16,
  },
  dateFieldTappable: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  dateFieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.mutedText,
  },
  dateFieldValue: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.accent,
  },
  pickerContainer: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  pickerDoneButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  pickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.accent,
  },
  applyButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.surface,
  },
  dateRangeSeparator: {
    fontSize: 18,
    color: palette.accent,
    fontWeight: '600',
  },
  quickSelectLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.mutedText,
    marginBottom: 12,
  },
  quickSelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  quickSelectButton: {
    backgroundColor: palette.surface,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minWidth: '47%',
    alignItems: 'center',
  },
  quickSelectText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },
});
