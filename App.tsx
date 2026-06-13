import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  View,
} from 'react-native';

import { AppHeader } from './src/components/AppHeader';
import { BottomNav } from './src/components/BottomNav';
import { initializeDatabase } from './src/db/initializeDatabase';
import {
  getActiveCategoryRules,
  recategorizeNonManualTransactions,
  saveCategoryMemoryRule,
  type CategoryRuleType,
  type StoredCategoryRule,
} from './src/features/categorization/categorizeTransaction';
import { createRule, deleteRule, updateRuleCategory } from './src/features/categorization/manageRules';
import {
  createCategory,
  deleteCategory,
  renameCategory,
  type CategoryRecord,
} from './src/features/categories/manageCategories';
import { parseHdfcStatementXls } from './src/features/import/hdfcParser';
import { importTransactions } from './src/features/import/importTransactions';
import { AIScreen } from './src/screens/AIScreen';
import { FinancesScreen } from './src/screens/FinancesScreen';
import { ImportScreen } from './src/screens/ImportScreen';
import { InvestmentScreen } from './src/screens/InvestmentScreen';
import { RulesScreen } from './src/screens/RulesScreen';
import { palette } from './src/theme/palette';

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

const appSections = ['finances', 'rules', 'investments', 'ai', 'import'] as const;

type AppSection = (typeof appSections)[number];

type CustomDateRange = {
  start: Date;
  end: Date;
};

type PendingCategoryChange = {
  transaction: TransactionPreview;
  categoryId: string | null;
};

type CategoryInsight = {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  transactionCount: number;
};

function getDateRangeForMonth(
  year: number,
  month: number,
  customRange?: CustomDateRange
): { start: Date; end: Date } {
  if (customRange) {
    return customRange;
  }
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999); // Last day of month at end of day
  return { start, end };
}

function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

const sectionLabels: Record<AppSection, string> = {
  finances: 'Finances',
  rules: 'Rules',
  investments: 'Investments',
  ai: 'AI',
  import: 'Import',
};

export default function App() {
  return (
    <SQLiteProvider databaseName="myfinance.db" onInit={initializeDatabase}>
      <DashboardScreen />
    </SQLiteProvider>
  );
}

function DashboardScreen() {
  const db = useSQLiteContext();
  const [allTransactions, setAllTransactions] = useState<TransactionPreview[]>(
    []
  );
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [rules, setRules] = useState<StoredCategoryRule[]>([]);
  const [importMessage, setImportMessage] = useState(
    'Pick an HDFC .xls statement to test the local import pipeline.'
  );
  const [isImporting, setIsImporting] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(['all']);
  const [editingTransactionId, setEditingTransactionId] = useState<
    number | null
  >(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [newRuleType, setNewRuleType] = useState<CategoryRuleType>('merchant');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleCategoryId, setNewRuleCategoryId] = useState<string | null>(
    null
  );
  const [activeSection, setActiveSection] = useState<AppSection>('finances');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<'debit' | 'credit'>(
    'debit'
  );
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  // Month-based time selector
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange | null>(null);
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<number | null>(null);
  const [isRuleCategoryDropdownOpen, setIsRuleCategoryDropdownOpen] = useState(false);
  const [pendingCategoryChange, setPendingCategoryChange] = useState<PendingCategoryChange | null>(null);
  const [showRuleTypeSelection, setShowRuleTypeSelection] = useState(false);

  const categoryNameById = Object.fromEntries(
    categories.map((category) => [category.id, category.name])
  );

  // Dismiss all overlays when tapping outside
  function dismissAllOverlays() {
    setEditingTransactionId(null);
    setIsCategoryFilterOpen(false);
    setExpandedRuleId(null);
    setIsRuleCategoryDropdownOpen(false);
    setSelectedCategoryId(null);
    setEditingCategoryId(null);
    setEditingCategoryName('');
  }

  const transactionFilters = [
    { id: 'all', name: 'All' },
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    { id: 'uncategorized', name: 'Uncategorized' },
  ];

  // Time-filtered transactions
  const dateRange = getDateRangeForMonth(
    selectedYear,
    selectedMonth,
    customDateRange ?? undefined
  );
  const timeFilteredTransactions = allTransactions.filter((transaction) => {
    const txDate = new Date(transaction.transaction_date);
    return txDate >= dateRange.start && txDate <= dateRange.end;
  });

  // Category insights for time period (filtered by direction)
  const categoryInsights: CategoryInsight[] = (() => {
    const directionTxns = timeFilteredTransactions.filter(
      (t) => t.direction === directionFilter
    );
    const totalAmount = directionTxns.reduce((sum, t) => sum + t.amount, 0);

    const byCategory = new Map<
      string,
      { amount: number; count: number }
    >();

    for (const txn of directionTxns) {
      const catId = txn.category_id ?? 'uncategorized';
      const existing = byCategory.get(catId) ?? { amount: 0, count: 0 };
      byCategory.set(catId, {
        amount: existing.amount + txn.amount,
        count: existing.count + 1,
      });
    }

    return Array.from(byCategory.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName:
          categoryId === 'uncategorized'
            ? 'Uncategorized'
            : categoryNameById[categoryId] ?? categoryId,
        amount: data.amount,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
        transactionCount: data.count,
      }))
      .sort((a, b) => b.amount - a.amount);
  })();

  // Period totals
  const periodDebitTotal = timeFilteredTransactions
    .filter((t) => t.direction === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);
  const periodCreditTotal = timeFilteredTransactions
    .filter((t) => t.direction === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);

  // Opening and Closing Balance (using stored balance from bank statement)
  const periodStartDate = dateRange.start.toISOString().split('T')[0];
  const periodEndDate = dateRange.end.toISOString().split('T')[0];

  // Opening balance: balance from last transaction before period start
  // (allTransactions is sorted DESC, so find first one before period)
  const lastTxnBeforePeriod = allTransactions.find(
    (t) => t.transaction_date < periodStartDate && t.balance !== null
  );
  const openingBalance = lastTxnBeforePeriod?.balance ?? 0;

  // Closing balance: balance from last transaction in the period
  // (find first one <= period end since sorted DESC)
  const lastTxnInPeriod = allTransactions.find(
    (t) => t.transaction_date <= periodEndDate && t.balance !== null
  );
  const closingBalance = lastTxnInPeriod?.balance ?? openingBalance;

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      const [allRows, categoryRows, ruleRows] =
        await Promise.all([
          db.getAllAsync<TransactionPreview>(
            `
              SELECT id, transaction_date, description, amount, direction, category_id, merchant_key, upi_note_keyword, balance
              FROM transactions
              ORDER BY transaction_date DESC, id DESC
            `
          ),
          db.getAllAsync<CategoryRecord>(
            `
              SELECT id, name, icon
              FROM categories
              ORDER BY name COLLATE NOCASE ASC
            `
          ),
          getActiveCategoryRules(db),
        ]);

      if (!isActive) {
        return;
      }
      setAllTransactions(allRows);
      setCategories(categoryRows);
      setRules(ruleRows);
    }

    loadDashboard().catch((error) => {
      console.error('Failed to load dashboard data', error);
    });

    return () => {
      isActive = false;
    };
  }, [db]);

  async function refreshDashboard() {
    const [allRows, categoryRows, ruleRows] =
      await Promise.all([
        db.getAllAsync<TransactionPreview>(
          `
            SELECT id, transaction_date, description, amount, direction, category_id, merchant_key, upi_note_keyword, balance
            FROM transactions
            ORDER BY transaction_date DESC, id DESC
          `
        ),
        db.getAllAsync<CategoryRecord>(
          `
            SELECT id, name, icon
            FROM categories
            ORDER BY name COLLATE NOCASE ASC
          `
        ),
        getActiveCategoryRules(db),
      ]);
    setAllTransactions(allRows);
    setCategories(categoryRows);
    setRules(ruleRows);
  }

  async function handleImportPress() {
    try {
      setIsImporting(true);
      setImportMessage('Waiting for file selection...');

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.ms-excel',
          'application/octet-stream',
          '*/*',
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setImportMessage('Import cancelled.');
        return;
      }

      const asset = result.assets[0];
      const pickedFile = new File(asset.uri);
      const fileBuffer = await pickedFile.arrayBuffer();
      const transactions = parseHdfcStatementXls(fileBuffer);
      const summary = await importTransactions(db, {
        sourceName: asset.name,
        sourceType: 'xls',
        transactions,
      });

      await refreshDashboard();

      setImportMessage(
        `Imported ${summary.insertedCount} new transactions from ${asset.name}. Skipped ${summary.skippedCount} duplicates from the same file.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown import error';
      setImportMessage(`Import failed: ${message}`);
    } finally {
      setIsImporting(false);
    }
  }

  function handleCategoryUpdate(
    transaction: TransactionPreview,
    categoryId: string | null
  ) {
    // If setting to uncategorized, apply directly
    if (!categoryId) {
      applyOneTimeCategory(transaction, null);
      return;
    }
    // Show the confirmation modal
    setPendingCategoryChange({ transaction, categoryId });
    setShowRuleTypeSelection(false);
    setEditingTransactionId(null);
  }

  async function applyOneTimeCategory(
    transaction: TransactionPreview,
    categoryId: string | null
  ) {
    await db.runAsync(
      `
        UPDATE transactions
        SET category_id = ?, category_source = 'manual', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      categoryId,
      transaction.id
    );
    await refreshDashboard();
    setPendingCategoryChange(null);
    setShowRuleTypeSelection(false);
  }

  async function applyWithRule(ruleType: CategoryRuleType) {
    if (!pendingCategoryChange || !pendingCategoryChange.categoryId) return;

    const { transaction, categoryId } = pendingCategoryChange;

    await db.runAsync(
      `
        UPDATE transactions
        SET category_id = ?, category_source = 'manual', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      categoryId,
      transaction.id
    );

    const patternValue = ruleType === 'merchant'
      ? transaction.merchant_key
      : transaction.upi_note_keyword;

    if (patternValue) {
      await saveCategoryMemoryRule(db, {
        ruleType,
        patternValue,
        categoryId,
        createdFromTransactionId: transaction.id,
      });
      await recategorizeNonManualTransactions(db);
    }

    await refreshDashboard();
    setPendingCategoryChange(null);
    setShowRuleTypeSelection(false);
  }

  function cancelCategoryChange() {
    setPendingCategoryChange(null);
    setShowRuleTypeSelection(false);
  }

  async function handleCreateCategory() {
    try {
      await createCategory(db, { name: newCategoryName, icon: '🏷️' });
      setNewCategoryName('');
      setSelectedCategoryId(null);
      await refreshDashboard();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create category';
      setImportMessage(message);
    }
  }

  async function handleRenameCategory(categoryId: string) {
    try {
      await renameCategory(db, {
        categoryId,
        name: editingCategoryName,
      });
      setEditingCategoryId(null);
      setEditingCategoryName('');
      setSelectedCategoryId(null);
      await refreshDashboard();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to rename category';
      setImportMessage(message);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    await deleteCategory(db, { categoryId });

    setSelectedFilters((current) => {
      const filtered = current.filter((id) => id !== categoryId);
      return filtered.length === 0 ? ['all'] : filtered;
    });

    setSelectedCategoryId(null);
    setEditingCategoryId(null);
    setEditingCategoryName('');

    await refreshDashboard();
  }

  async function handleRuleCategoryUpdate(ruleId: number, categoryId: string) {
    const existingRule = rules.find((rule) => rule.id === ruleId);

    if (!existingRule) {
      return;
    }

    await updateRuleCategory(db, {
      ruleId,
      categoryId,
      ruleType: existingRule.rule_type,
    });
    await refreshDashboard();
  }

  async function handleRuleTypeUpdate(
    ruleId: number,
    ruleType: CategoryRuleType
  ) {
    const existingRule = rules.find((rule) => rule.id === ruleId);

    if (!existingRule) {
      return;
    }

    await updateRuleCategory(db, {
      ruleId,
      categoryId: existingRule.category_id,
      ruleType,
    });
    await refreshDashboard();
  }

  async function handleDeleteRule(ruleId: number) {
    await deleteRule(db, { ruleId });
    await refreshDashboard();
  }

  async function handleCreateRule() {
    if (!newRuleCategoryId) {
      setImportMessage('Select a category before creating the rule.');
      return;
    }

    try {
      await createRule(db, {
        ruleType: newRuleType,
        patternValue: newRulePattern,
        categoryId: newRuleCategoryId,
      });
      setNewRulePattern('');
      await refreshDashboard();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create rule';
      setImportMessage(message);
    }
  }

  const filteredTransactions = timeFilteredTransactions.filter((transaction) => {
    if (transaction.direction !== directionFilter) {
      return false;
    }

    if (selectedFilters.includes('all')) {
      return true;
    }

    if (selectedFilters.includes('uncategorized') && transaction.category_id === null) {
      return true;
    }

    return transaction.category_id !== null && selectedFilters.includes(transaction.category_id);
  });

  const displayedTransactions = showAllTransactions
    ? filteredTransactions
    : filteredTransactions.slice(0, 8);
  const selectedFilterNames = selectedFilters.includes('all')
    ? 'All'
    : selectedFilters
        .map((id) => transactionFilters.find((f) => f.id === id)?.name)
        .filter(Boolean)
        .join(', ') || 'All';
  const selectedCategoryTotal =
    selectedFilters.includes('all')
      ? null
      : filteredTransactions.reduce(
          (sum, transaction) => sum + transaction.amount,
          0
        );

  const debitTotal = periodDebitTotal;
  const creditTotal = periodCreditTotal;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {activeSection !== 'ai' ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.scrollView}
        >
          <Pressable onPress={dismissAllOverlays} style={styles.dismissLayer}>
            <AppHeader
              sections={appSections}
              labels={sectionLabels}
              activeSection={activeSection}
              isMenuOpen={isMenuOpen}
              onToggleMenu={() => setIsMenuOpen((current) => !current)}
              onSelectSection={(section) => {
                setActiveSection(section);
                setIsMenuOpen(false);
              }}
            />

            <View style={styles.mainPane}>
        {activeSection === 'finances' ? (
          <FinancesScreen
            allTransactions={allTransactions}
            categories={categories}
            categoryNameById={categoryNameById}
            filteredTransactions={filteredTransactions}
            displayedTransactions={displayedTransactions}
            selectedFilters={selectedFilters}
            selectedFilterNames={selectedFilterNames}
            selectedCategoryTotal={selectedCategoryTotal}
            directionFilter={directionFilter}
            debitTotal={debitTotal}
            creditTotal={creditTotal}
            transactionFilters={transactionFilters}
            editingTransactionId={editingTransactionId}
            showAllTransactions={showAllTransactions}
            isCategoryFilterOpen={isCategoryFilterOpen}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            monthLabel={formatMonthYear(selectedYear, selectedMonth)}
            categoryInsights={categoryInsights}
            openingBalance={openingBalance}
            closingBalance={closingBalance}
            onToggleDirectionFilter={(direction) => setDirectionFilter(direction)}
            onToggleFilter={(filterId) => {
              setSelectedFilters((current) => {
                if (filterId === 'all') {
                  return ['all'];
                }
                const withoutAll = current.filter((id) => id !== 'all');
                if (withoutAll.includes(filterId)) {
                  const newFilters = withoutAll.filter((id) => id !== filterId);
                  return newFilters.length === 0 ? ['all'] : newFilters;
                }
                return [...withoutAll, filterId];
              });
            }}
            onSelectAllFilter={() => {
              setSelectedFilters(['all']);
              setIsCategoryFilterOpen(false);
            }}
            onToggleCategoryFilter={() =>
              setIsCategoryFilterOpen((current) => !current)
            }
            onGoToImport={() => setActiveSection('import')}
            onToggleTransactionEdit={(transactionId) =>
              setEditingTransactionId((current) =>
                current === transactionId ? null : transactionId
              )
            }
            onCategoryUpdate={handleCategoryUpdate}
            pendingCategoryChange={pendingCategoryChange}
            showRuleTypeSelection={showRuleTypeSelection}
            onApplyOneTime={() => {
              if (pendingCategoryChange) {
                applyOneTimeCategory(pendingCategoryChange.transaction, pendingCategoryChange.categoryId);
              }
            }}
            onShowRuleOptions={() => setShowRuleTypeSelection(true)}
            onApplyWithRule={applyWithRule}
            onCancelCategoryChange={cancelCategoryChange}
            onToggleShowAllTransactions={() =>
              setShowAllTransactions((current) => !current)
            }
            onPreviousMonth={() => {
              if (selectedMonth === 0) {
                setSelectedMonth(11);
                setSelectedYear(selectedYear - 1);
              } else {
                setSelectedMonth(selectedMonth - 1);
              }
              setCustomDateRange(null);
            }}
            onNextMonth={() => {
              const now = new Date();
              const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
              if (!isCurrentMonth) {
                if (selectedMonth === 11) {
                  setSelectedMonth(0);
                  setSelectedYear(selectedYear + 1);
                } else {
                  setSelectedMonth(selectedMonth + 1);
                }
                setCustomDateRange(null);
              }
            }}
            onOpenMonthPicker={() => setIsCustomPickerOpen(true)}
            isCustomPickerOpen={isCustomPickerOpen}
            customDateRange={customDateRange}
            onCloseCustomPicker={() => setIsCustomPickerOpen(false)}
            onApplyCustomRange={(range) => {
              setCustomDateRange(range);
              setIsCustomPickerOpen(false);
            }}
            onSelectMonth={(year, month) => {
              setSelectedYear(year);
              setSelectedMonth(month);
              setCustomDateRange(null);
              setIsCustomPickerOpen(false);
            }}
          />
        ) : null}

        {activeSection === 'rules' ? (
          <RulesScreen
            categories={categories}
            rules={rules}
            categoryNameById={categoryNameById}
            newRuleType={newRuleType}
            newRulePattern={newRulePattern}
            newRuleCategoryId={newRuleCategoryId}
            newCategoryName={newCategoryName}
            selectedCategoryId={selectedCategoryId}
            editingCategoryId={editingCategoryId}
            editingCategoryName={editingCategoryName}
            expandedRuleId={expandedRuleId}
            isCategoryDropdownOpen={isRuleCategoryDropdownOpen}
            onSetNewRuleType={setNewRuleType}
            onSetNewRulePattern={setNewRulePattern}
            onSetNewRuleCategoryId={setNewRuleCategoryId}
            onCreateRule={handleCreateRule}
            onSetNewCategoryName={setNewCategoryName}
            onSelectCategory={(categoryId) => {
              setSelectedCategoryId((current) =>
                current === categoryId ? null : categoryId
              );
              setEditingCategoryId(null);
              setEditingCategoryName('');
            }}
            onSetEditingCategoryId={setEditingCategoryId}
            onSetEditingCategoryName={setEditingCategoryName}
            onCreateCategory={handleCreateCategory}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
            onUpdateRuleType={handleRuleTypeUpdate}
            onUpdateRuleCategory={handleRuleCategoryUpdate}
            onDeleteRule={handleDeleteRule}
            onSetExpandedRuleId={setExpandedRuleId}
            onSetCategoryDropdownOpen={setIsRuleCategoryDropdownOpen}
          />
        ) : null}

        {activeSection === 'investments' ? (
          <InvestmentScreen
            onGoToImport={() => setActiveSection('import')}
          />
        ) : null}


          {activeSection === 'import' ? (
            <ImportScreen
              isImporting={isImporting}
              importMessage={importMessage}
              onImportPress={handleImportPress}
            />
          ) : null}
          </View>
          </Pressable>
        </ScrollView>
        ) : null}

        {activeSection === 'ai' ? (
          <AIScreen />
        ) : null}

        <BottomNav
          sections={appSections}
          labels={sectionLabels}
          activeSection={activeSection}
          onSelectSection={setActiveSection}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
    paddingTop: NativeStatusBar.currentHeight,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  dismissLayer: {
    gap: 16,
  },
  mainPane: {
    gap: 16,
  },
});
