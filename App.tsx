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
import { FinancesScreen } from './src/screens/FinancesScreen';
import { ImportScreen } from './src/screens/ImportScreen';
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
};

const appSections = ['finances', 'rules', 'import'] as const;

type AppSection = (typeof appSections)[number];

const timePeriods = ['7d', '30d', 'prev_month', 'custom'] as const;

type TimePeriod = (typeof timePeriods)[number];

const timePeriodLabels: Record<TimePeriod, string> = {
  '7d': '7 Days',
  '30d': '30 Days',
  prev_month: 'Prev Month',
  custom: 'Custom',
};

type CustomDateRange = {
  start: Date;
  end: Date;
};

type CategoryInsight = {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  transactionCount: number;
};

function getDateRangeForPeriod(
  period: TimePeriod,
  customRange?: CustomDateRange
): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case '7d': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start, end: today };
    }
    case '30d': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start, end: today };
    }
    case 'prev_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start, end };
    }
    case 'custom': {
      if (customRange) {
        return customRange;
      }
      // Default to last 90 days if no custom range set
      const start = new Date(today);
      start.setDate(start.getDate() - 89);
      return { start, end: today };
    }
    default:
      return { start: new Date(0), end: today };
  }
}

const sectionLabels: Record<AppSection, string> = {
  finances: 'Finances',
  rules: 'Rules',
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
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
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
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d');
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange | null>(null);
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<number | null>(null);
  const [isRuleCategoryDropdownOpen, setIsRuleCategoryDropdownOpen] = useState(false);

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
  const dateRange = getDateRangeForPeriod(
    timePeriod,
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

  // Insights
  const periodDebitTotal = timeFilteredTransactions
    .filter((t) => t.direction === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);
  const periodCreditTotal = timeFilteredTransactions
    .filter((t) => t.direction === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);

  const daysInPeriod = Math.max(
    1,
    Math.ceil(
      (dateRange.end.getTime() - dateRange.start.getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1
  );
  const dailyAverage = periodDebitTotal / daysInPeriod;
  const monthlyAverage = dailyAverage * 30;
  const highestCategory = categoryInsights[0] ?? null;

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      const [allRows, categoryRows, ruleRows] =
        await Promise.all([
          db.getAllAsync<TransactionPreview>(
            `
              SELECT id, transaction_date, description, amount, direction, category_id, merchant_key, upi_note_keyword
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
            SELECT id, transaction_date, description, amount, direction, category_id, merchant_key, upi_note_keyword
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

  async function handleCategoryUpdate(
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

    if (categoryId) {
      await saveCategoryMemoryRule(db, {
        ruleType: 'merchant',
        patternValue: transaction.merchant_key,
        categoryId,
        createdFromTransactionId: transaction.id,
      });
      await saveCategoryMemoryRule(db, {
        ruleType: 'upi_note_keyword',
        patternValue: transaction.upi_note_keyword,
        categoryId,
        createdFromTransactionId: transaction.id,
      });
      await recategorizeNonManualTransactions(db);
    }

    await refreshDashboard();
    setEditingTransactionId(null);
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

    if (selectedFilter === categoryId) {
      setSelectedFilter('all');
    }

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

    if (selectedFilter === 'all') {
      return true;
    }

    if (selectedFilter === 'uncategorized') {
      return transaction.category_id === null;
    }

    return transaction.category_id === selectedFilter;
  });

  const displayedTransactions = showAllTransactions
    ? filteredTransactions
    : filteredTransactions.slice(0, 8);
  const selectedFilterName =
    transactionFilters.find((filter) => filter.id === selectedFilter)?.name ??
    'All';
  const selectedCategoryTotal =
    selectedFilter === 'all'
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
            selectedFilter={selectedFilter}
            selectedFilterName={selectedFilterName}
            selectedCategoryTotal={selectedCategoryTotal}
            directionFilter={directionFilter}
            debitTotal={debitTotal}
            creditTotal={creditTotal}
            transactionFilters={transactionFilters}
            editingTransactionId={editingTransactionId}
            showAllTransactions={showAllTransactions}
            isCategoryFilterOpen={isCategoryFilterOpen}
            timePeriod={timePeriod}
            timePeriodLabels={timePeriodLabels}
            timePeriods={timePeriods}
            categoryInsights={categoryInsights}
            monthlyAverage={monthlyAverage}
            highestCategory={highestCategory}
            onToggleDirectionFilter={(direction) => setDirectionFilter(direction)}
            onSelectFilter={(filterId) => {
              setSelectedFilter(filterId);
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
            onToggleShowAllTransactions={() =>
              setShowAllTransactions((current) => !current)
            }
            onSelectTimePeriod={(period) => {
              if (period === 'custom') {
                setIsCustomPickerOpen(true);
              } else {
                setTimePeriod(period);
              }
            }}
            isCustomPickerOpen={isCustomPickerOpen}
            customDateRange={customDateRange}
            onCloseCustomPicker={() => setIsCustomPickerOpen(false)}
            onApplyCustomRange={(range) => {
              setCustomDateRange(range);
              setTimePeriod('custom');
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

        {activeSection === 'import' ? (
          <ImportScreen
            isImporting={isImporting}
            importMessage={importMessage}
            onImportPress={handleImportPress}
          />
        ) : null}
        </View>

        <BottomNav
          sections={appSections}
          labels={sectionLabels}
          activeSection={activeSection}
          onSelectSection={setActiveSection}
        />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
    paddingTop: NativeStatusBar.currentHeight,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  dismissLayer: {
    gap: 16,
  },
  mainPane: {
    gap: 16,
  },
});
