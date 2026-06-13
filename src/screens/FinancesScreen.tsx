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
  balance: number | null;
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
  selectedFilters: string[];
  selectedFilterNames: string;
  selectedCategoryTotal: number | null;
  directionFilter: 'debit' | 'credit';
  debitTotal: number;
  creditTotal: number;
  transactionFilters: TransactionFilter[];
  editingTransactionId: number | null;
  showAllTransactions: boolean;
  isCategoryFilterOpen: boolean;
  selectedYear: number;
  selectedMonth: number;
  monthLabel: string;
  categoryInsights: CategoryInsight[];
  openingBalance: number;
  closingBalance: number;
  onToggleDirectionFilter: (direction: 'debit' | 'credit') => void;
  onToggleFilter: (filterId: string) => void;
  onSelectAllFilter: () => void;
  onToggleCategoryFilter: () => void;
  onGoToImport: () => void;
  onToggleTransactionEdit: (transactionId: number) => void;
  onCategoryUpdate: (
    transaction: TransactionPreview,
    categoryId: string | null
  ) => void;
  pendingCategoryChange: {
    transaction: TransactionPreview;
    categoryId: string | null;
  } | null;
  showRuleTypeSelection: boolean;
  onApplyOneTime: () => void;
  onShowRuleOptions: () => void;
  onApplyWithRule: (ruleType: 'merchant' | 'upi_note_keyword') => void;
  onCancelCategoryChange: () => void;
  onToggleShowAllTransactions: () => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onOpenMonthPicker: () => void;
  isCustomPickerOpen: boolean;
  customDateRange: CustomDateRange | null;
  onCloseCustomPicker: () => void;
  onApplyCustomRange: (range: CustomDateRange) => void;
  onSelectMonth: (year: number, month: number) => void;
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
  selectedFilters,
  selectedFilterNames,
  selectedCategoryTotal,
  directionFilter,
  debitTotal,
  creditTotal,
  transactionFilters,
  editingTransactionId,
  showAllTransactions,
  isCategoryFilterOpen,
  selectedYear,
  selectedMonth,
  monthLabel,
  categoryInsights,
  openingBalance,
  closingBalance,
  onToggleDirectionFilter,
  onToggleFilter,
  onSelectAllFilter,
  onToggleCategoryFilter,
  onGoToImport,
  onToggleTransactionEdit,
  onCategoryUpdate,
  pendingCategoryChange,
  showRuleTypeSelection,
  onApplyOneTime,
  onShowRuleOptions,
  onApplyWithRule,
  onCancelCategoryChange,
  onToggleShowAllTransactions,
  onPreviousMonth,
  onNextMonth,
  onOpenMonthPicker,
  isCustomPickerOpen,
  customDateRange,
  onCloseCustomPicker,
  onApplyCustomRange,
  onSelectMonth,
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

  // Sort category insights: selected first, then unselected
  const sortedCategoryInsights = [...categoryInsights].sort((a, b) => {
    const aSelected = selectedFilters.includes(a.categoryId);
    const bSelected = selectedFilters.includes(b.categoryId);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return 0;
  });

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

  // Check if we can go to next month (can't go past current month)
  const now = new Date();
  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  return (
    <>
      {/* Month Selector */}
      <View style={styles.monthSelectorRow}>
        <Pressable onPress={onPreviousMonth} style={styles.monthArrowButton}>
          <Text style={styles.monthArrowText}>‹</Text>
        </Pressable>
        <Pressable onPress={onOpenMonthPicker} style={styles.monthLabelButton}>
          <Text style={styles.monthLabelText}>{monthLabel}</Text>
          <Text style={styles.monthDropdownIcon}>▾</Text>
        </Pressable>
        <Pressable
          onPress={onNextMonth}
          style={[styles.monthArrowButton, isCurrentMonth && styles.monthArrowDisabled]}
          disabled={isCurrentMonth}
        >
          <Text style={[styles.monthArrowText, isCurrentMonth && styles.monthArrowTextDisabled]}>›</Text>
        </Pressable>
      </View>

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

      {/* Balance Section */}
      <View style={styles.balanceSection}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>OPENING BALANCE</Text>
          <Text style={[styles.balanceValue, openingBalance >= 0 ? styles.creditText : styles.debitText]}>
            {formatCurrency(Math.abs(openingBalance))}
          </Text>
          <Text style={styles.balanceSubtext}>start of period</Text>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>CLOSING BALANCE</Text>
          <Text style={[styles.balanceValue, closingBalance >= 0 ? styles.creditText : styles.debitText]}>
            {formatCurrency(Math.abs(closingBalance))}
          </Text>
          <Text style={styles.balanceSubtext}>end of period</Text>
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
                {selectedFilters.includes('all')
                  ? 'All'
                  : selectedFilters.length === 1
                    ? selectedFilterNames
                    : `${selectedFilters.length} selected`}{' '}
                ▾
              </Text>
            </Pressable>
          </View>

          {isCategoryFilterOpen ? (
            <View style={styles.dropdownMenu}>
              {transactionFilters.map((filter) => {
                const isSelected =
                  filter.id === 'all'
                    ? selectedFilters.includes('all')
                    : selectedFilters.includes(filter.id);
                return (
                  <Pressable
                    key={filter.id}
                    onPress={() =>
                      filter.id === 'all'
                        ? onSelectAllFilter()
                        : onToggleFilter(filter.id)
                    }
                    style={[
                      styles.dropdownOption,
                      isSelected && styles.dropdownOptionSelected,
                    ]}
                  >
                    <View style={styles.dropdownOptionRow}>
                      <View
                        style={[
                          styles.checkbox,
                          isSelected && styles.checkboxSelected,
                        ]}
                      >
                        {isSelected ? (
                          <Text style={styles.checkmark}>✓</Text>
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          isSelected && styles.dropdownOptionTextSelected,
                        ]}
                      >
                        {filter.id === 'all' ? 'All Categories' : filter.name}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryTilesRow}
          >
            {sortedCategoryInsights.map((insight) => {
              const isSelected = selectedFilters.includes(insight.categoryId);
              return (
                <Pressable
                  key={insight.categoryId}
                  onPress={() => onToggleFilter(insight.categoryId)}
                  style={[
                    styles.categoryTile,
                    isSelected && styles.categoryTileSelected,
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
              );
            })}
          </ScrollView>

          {!selectedFilters.includes('all') && selectedCategoryTotal !== null ? (
            <View style={styles.focusBanner}>
              <Text style={styles.focusLabel}>
                Focus: {selectedFilters.length === 1 ? selectedFilterNames : `${selectedFilters.length} categories`}
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
        <View style={styles.transactionsList}>
          {displayedTransactions.map((transaction, index) => {
            const presentation = presentTransaction({
              description: transaction.description,
              merchantKey: transaction.merchant_key,
              upiNoteKeyword: transaction.upi_note_keyword,
            });
            const isDebit = transaction.direction === 'debit';
            const isLast = index === displayedTransactions.length - 1;
            const isNearBottom = index >= displayedTransactions.length - 2;

            return (
              <View
                key={`txn-${transaction.id}`}
                style={[styles.transactionRow, !isLast && styles.transactionRowBorder]}
              >
                <Text style={styles.transactionDate}>
                  {new Date(transaction.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </Text>
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionMerchant} numberOfLines={1}>
                    {presentation.merchantLabel}
                  </Text>
                  {presentation.noteLabel ? (
                    <Text style={styles.transactionNote} numberOfLines={1}>
                      {presentation.noteLabel}
                    </Text>
                  ) : null}
                  <View style={styles.categoryWrapper}>
                    <Pressable
                      onPress={() => onToggleTransactionEdit(transaction.id)}
                      style={[
                        styles.categoryPill,
                        editingTransactionId === transaction.id && styles.categoryPillActive,
                      ]}
                    >
                      <Text style={styles.categoryPillText} numberOfLines={1}>
                        {transaction.category_id
                          ? categoryNameById[transaction.category_id] ?? transaction.category_id
                          : 'Uncategorized'}
                      </Text>
                      <Text style={styles.categoryPillIcon}>▾</Text>
                    </Pressable>
                    {editingTransactionId === transaction.id ? (
                      <ScrollView
                        style={[
                          styles.categoryDropdown,
                          isNearBottom && styles.categoryDropdownAbove,
                        ]}
                        nestedScrollEnabled
                      >
                        <Pressable
                          onPress={() => onCategoryUpdate(transaction, null)}
                          style={[
                            styles.categoryDropdownOption,
                            !transaction.category_id && styles.categoryDropdownOptionSelected,
                          ]}
                        >
                          <Text style={[
                            styles.categoryDropdownText,
                            !transaction.category_id && styles.categoryDropdownTextSelected,
                          ]}>Uncategorized</Text>
                        </Pressable>
                        {categories.map((category) => (
                          <Pressable
                            key={`${transaction.id}-${category.id}`}
                            onPress={() => onCategoryUpdate(transaction, category.id)}
                            style={[
                              styles.categoryDropdownOption,
                              transaction.category_id === category.id &&
                                styles.categoryDropdownOptionSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.categoryDropdownText,
                                transaction.category_id === category.id &&
                                  styles.categoryDropdownTextSelected,
                              ]}
                            >
                              {category.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                </View>
                <Text
                  style={[
                    styles.transactionAmount,
                    isDebit ? styles.debitText : styles.creditText,
                  ]}
                >
                  {isDebit ? '-' : '+'}₹{transaction.amount.toLocaleString('en-IN')}
                </Text>
              </View>
            );
          })}
        </View>
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

      {/* Month Picker Modal */}
      <Modal
        visible={isCustomPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={onCloseCustomPicker}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Time Range</Text>
                <Pressable onPress={onCloseCustomPicker} style={styles.modalClose}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              </View>

              {/* Quick Month Selection */}
              <Text style={styles.quickSelectLabel}>SELECT MONTH</Text>
              <View style={styles.monthGrid}>
                {(() => {
                  const months = [];
                  const currentDate = new Date();
                  // Show last 12 months
                  for (let i = 0; i < 12; i++) {
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                    const year = date.getFullYear();
                    const month = date.getMonth();
                    const isSelected = year === selectedYear && month === selectedMonth && !customDateRange;
                    const label = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                    months.push(
                      <Pressable
                        key={`${year}-${month}`}
                        style={[styles.monthButton, isSelected && styles.monthButtonSelected]}
                        onPress={() => onSelectMonth(year, month)}
                      >
                        <Text style={[styles.monthButtonText, isSelected && styles.monthButtonTextSelected]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  }
                  return months;
                })()}
              </View>

              {/* Custom Date Range Section */}
              <Text style={styles.quickSelectLabel}>CUSTOM DATE RANGE</Text>
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

              {/* Apply Custom Range Button */}
              <Pressable style={styles.applyButton} onPress={handleApplyRange}>
                <Text style={styles.applyButtonText}>Apply Custom Range</Text>
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
                <Pressable
                  style={styles.quickSelectButton}
                  onPress={() => applyQuickSelect(180)}
                >
                  <Text style={styles.quickSelectText}>6 Months</Text>
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
          </ScrollView>
        </View>
      </Modal>

      {/* Category Change Confirmation Modal */}
      <Modal
        visible={pendingCategoryChange !== null}
        transparent
        animationType="fade"
        onRequestClose={onCancelCategoryChange}
      >
        <View style={styles.categoryModalOverlay}>
          <View style={styles.categoryModalContent}>
            {!showRuleTypeSelection ? (
              <>
                <Text style={styles.categoryModalTitle}>Apply Category</Text>
                <Text style={styles.categoryModalSubtitle}>
                  How would you like to apply "{pendingCategoryChange?.categoryId ? categoryNameById[pendingCategoryChange.categoryId] : ''}"?
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.categoryModalOption,
                    pressed && styles.categoryModalOptionPressed,
                  ]}
                  onPress={onApplyOneTime}
                >
                  <Text style={styles.categoryModalOptionTitle}>One time only</Text>
                  <Text style={styles.categoryModalOptionDesc}>Apply to this transaction only</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.categoryModalOption,
                    pressed && styles.categoryModalOptionPressed,
                  ]}
                  onPress={onShowRuleOptions}
                >
                  <Text style={styles.categoryModalOptionTitle}>Create a rule</Text>
                  <Text style={styles.categoryModalOptionDesc}>Auto-apply to similar transactions</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.categoryModalCancel,
                    pressed && styles.categoryModalCancelPressed,
                  ]}
                  onPress={onCancelCategoryChange}
                >
                  <Text style={styles.categoryModalCancelText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.categoryModalTitle}>Create Rule Based On</Text>
                {pendingCategoryChange?.transaction.merchant_key ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.categoryModalOption,
                      pressed && styles.categoryModalOptionPressed,
                    ]}
                    onPress={() => onApplyWithRule('merchant')}
                  >
                    <Text style={styles.categoryModalOptionTitle}>Merchant</Text>
                    <Text style={styles.categoryModalOptionDesc}>
                      "{pendingCategoryChange.transaction.merchant_key}"
                    </Text>
                  </Pressable>
                ) : null}
                {pendingCategoryChange?.transaction.upi_note_keyword ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.categoryModalOption,
                      pressed && styles.categoryModalOptionPressed,
                    ]}
                    onPress={() => onApplyWithRule('upi_note_keyword')}
                  >
                    <Text style={styles.categoryModalOptionTitle}>UPI Note</Text>
                    <Text style={styles.categoryModalOptionDesc}>
                      "{pendingCategoryChange.transaction.upi_note_keyword}"
                    </Text>
                  </Pressable>
                ) : null}
                {!pendingCategoryChange?.transaction.merchant_key &&
                 !pendingCategoryChange?.transaction.upi_note_keyword ? (
                  <Text style={styles.categoryModalNoRule}>
                    No merchant or UPI note available for this transaction. Applying one-time only.
                  </Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.categoryModalCancel,
                    pressed && styles.categoryModalCancelPressed,
                  ]}
                  onPress={onCancelCategoryChange}
                >
                  <Text style={styles.categoryModalCancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Month Selector
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 12,
    padding: 8,
    gap: 8,
  },
  monthArrowButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowDisabled: {
    opacity: 0.4,
  },
  monthArrowText: {
    fontSize: 24,
    fontWeight: '300',
    color: palette.accent,
  },
  monthArrowTextDisabled: {
    color: palette.mutedText,
  },
  monthLabelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  monthLabelText: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.primaryText,
  },
  monthDropdownIcon: {
    fontSize: 12,
    color: palette.accent,
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

  // Balance Section
  balanceSection: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  balanceCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  balanceDivider: {
    width: 1,
    height: 48,
    backgroundColor: palette.border,
    marginHorizontal: 12,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.mutedText,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  balanceSubtext: {
    fontSize: 11,
    color: palette.mutedText,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
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
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  checkmark: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.surface,
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

  // Transaction List (high-density)
  transactionsList: {
    backgroundColor: palette.surface,
    borderRadius: 12,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  transactionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  transactionDate: {
    fontSize: 11,
    fontWeight: '500',
    color: palette.mutedText,
    width: 44,
  },
  transactionInfo: {
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
    marginTop: 2,
  },
  categoryWrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceContainerLow,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  categoryPillActive: {
    backgroundColor: palette.accentSoftMuted,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: palette.secondaryText,
    maxWidth: 100,
  },
  categoryPillIcon: {
    fontSize: 8,
    color: palette.mutedText,
  },
  categoryDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    backgroundColor: palette.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    minWidth: 140,
    maxHeight: 180,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    overflow: 'hidden',
  },
  categoryDropdownAbove: {
    top: 'auto',
    bottom: '100%',
    marginTop: 0,
    marginBottom: 4,
  },
  categoryDropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryDropdownOptionSelected: {
    backgroundColor: palette.accentSoftMuted,
  },
  categoryDropdownText: {
    fontSize: 13,
    color: palette.primaryText,
  },
  categoryDropdownTextSelected: {
    color: palette.accent,
    fontWeight: '600',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    minWidth: 80,
  },
  debitAccent: {
    backgroundColor: palette.danger,
  },
  creditAccent: {
    backgroundColor: palette.success,
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
  modalScrollView: {
    maxHeight: '85%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: palette.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  // Month Grid
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  monthButton: {
    backgroundColor: palette.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: '30%',
    alignItems: 'center',
  },
  monthButtonSelected: {
    backgroundColor: palette.accent,
  },
  monthButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.primaryText,
  },
  monthButtonTextSelected: {
    color: palette.surface,
    fontWeight: '600',
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

  // Category Change Modal
  categoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  categoryModalContent: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  categoryModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
    marginBottom: 8,
  },
  categoryModalSubtitle: {
    fontSize: 14,
    color: palette.mutedText,
    marginBottom: 20,
  },
  categoryModalOption: {
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  categoryModalOptionPressed: {
    backgroundColor: '#d0e8ff',
  },
  categoryModalOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
    marginBottom: 2,
  },
  categoryModalOptionDesc: {
    fontSize: 12,
    color: palette.mutedText,
  },
  categoryModalNoRule: {
    fontSize: 13,
    color: palette.mutedText,
    textAlign: 'center',
    paddingVertical: 16,
  },
  categoryModalCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
    borderRadius: 8,
  },
  categoryModalCancelPressed: {
    backgroundColor: '#d0e8ff',
  },
  categoryModalCancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.mutedText,
  },
});
