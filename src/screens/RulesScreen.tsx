import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type {
  CategoryRuleType,
  StoredCategoryRule,
} from '../features/categorization/categorizeTransaction';
import type { CategoryRecord } from '../features/categories/manageCategories';
import { palette } from '../theme/palette';

type RulesScreenProps = {
  categories: CategoryRecord[];
  rules: StoredCategoryRule[];
  categoryNameById: Record<string, string>;
  newRuleType: CategoryRuleType;
  newRulePattern: string;
  newRuleCategoryId: string | null;
  newCategoryName: string;
  selectedCategoryId: string | null;
  editingCategoryId: string | null;
  editingCategoryName: string;
  expandedRuleId: number | null;
  isCategoryDropdownOpen: boolean;
  onSetNewRuleType: (value: CategoryRuleType) => void;
  onSetNewRulePattern: (value: string) => void;
  onSetNewRuleCategoryId: (value: string | null) => void;
  onCreateRule: () => void;
  onSetNewCategoryName: (value: string) => void;
  onSelectCategory: (categoryId: string) => void;
  onSetEditingCategoryId: (categoryId: string | null) => void;
  onSetEditingCategoryName: (value: string) => void;
  onCreateCategory: () => void;
  onRenameCategory: (categoryId: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  onUpdateRuleType: (ruleId: number, ruleType: CategoryRuleType) => void;
  onUpdateRuleCategory: (ruleId: number, categoryId: string) => void;
  onDeleteRule: (ruleId: number) => void;
  onSetExpandedRuleId: (ruleId: number | null) => void;
  onSetCategoryDropdownOpen: (open: boolean) => void;
};

export function RulesScreen({
  categories,
  rules,
  categoryNameById,
  newRuleType,
  newRulePattern,
  newRuleCategoryId,
  newCategoryName,
  selectedCategoryId,
  editingCategoryId,
  editingCategoryName,
  expandedRuleId,
  isCategoryDropdownOpen,
  onSetNewRuleType,
  onSetNewRulePattern,
  onSetNewRuleCategoryId,
  onCreateRule,
  onSetNewCategoryName,
  onSelectCategory,
  onSetEditingCategoryId,
  onSetEditingCategoryName,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onUpdateRuleType,
  onUpdateRuleCategory,
  onDeleteRule,
  onSetExpandedRuleId,
  onSetCategoryDropdownOpen,
}: RulesScreenProps) {

  const selectedCategoryName = newRuleCategoryId
    ? categoryNameById[newRuleCategoryId] ?? 'Select'
    : 'Select Category';

  return (
    <>
      {/* Create New Rule Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create New Rule</Text>

        {/* Rule Type Toggle */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>RULE TYPE</Text>
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => onSetNewRuleType('merchant')}
              style={[
                styles.toggleButton,
                newRuleType === 'merchant' && styles.toggleButtonActive,
              ]}
            >
              <Text style={styles.toggleIcon}>🏪</Text>
              <Text
                style={[
                  styles.toggleText,
                  newRuleType === 'merchant' && styles.toggleTextActive,
                ]}
              >
                Merchant
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onSetNewRuleType('upi_note_keyword')}
              style={[
                styles.toggleButton,
                newRuleType === 'upi_note_keyword' && styles.toggleButtonActive,
              ]}
            >
              <Text style={styles.toggleIcon}>📝</Text>
              <Text
                style={[
                  styles.toggleText,
                  newRuleType === 'upi_note_keyword' && styles.toggleTextActive,
                ]}
              >
                UPI Note
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Pattern Input */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>PATTERN MATCH</Text>
          <TextInput
            value={newRulePattern}
            onChangeText={onSetNewRulePattern}
            placeholder={
              newRuleType === 'merchant'
                ? 'e.g. swiggy, zomato, amazon'
                : 'e.g. rent, groceries, salary'
            }
            placeholderTextColor={palette.mutedText}
            style={styles.textInput}
          />
        </View>

        {/* Category Selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>ASSIGN TO CATEGORY</Text>
          <Pressable
            style={styles.dropdown}
            onPress={() => onSetCategoryDropdownOpen(!isCategoryDropdownOpen)}
          >
            <Text
              style={[
                styles.dropdownText,
                !newRuleCategoryId && styles.dropdownPlaceholder,
              ]}
            >
              {selectedCategoryName}
            </Text>
            <Text style={styles.dropdownChevron}>▾</Text>
          </Pressable>

          {isCategoryDropdownOpen && (
            <View style={styles.dropdownMenu}>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  style={[
                    styles.dropdownOption,
                    newRuleCategoryId === category.id && styles.dropdownOptionSelected,
                  ]}
                  onPress={() => {
                    onSetNewRuleCategoryId(category.id);
                    onSetCategoryDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      newRuleCategoryId === category.id && styles.dropdownOptionTextSelected,
                    ]}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Save Button */}
        <Pressable onPress={onCreateRule} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save Rule</Text>
        </Pressable>
      </View>

      {/* Active Rules Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Rules</Text>
          <Text style={styles.ruleCount}>{rules.length}</Text>
        </View>

        {rules.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No rules yet</Text>
            <Text style={styles.emptyText}>
              Create rules to automatically categorize transactions
            </Text>
          </View>
        ) : (
          <View style={styles.rulesList}>
            {rules.map((rule) => (
              <View key={rule.id} style={styles.ruleCard}>
                <View style={styles.ruleMain}>
                  <View style={styles.ruleIconContainer}>
                    <Text style={styles.ruleIcon}>
                      {rule.rule_type === 'merchant' ? '🏪' : '📝'}
                    </Text>
                  </View>
                  <View style={styles.ruleContent}>
                    <Text style={styles.rulePattern}>{rule.pattern_value}</Text>
                    <View style={styles.ruleArrowRow}>
                      <Text style={styles.ruleArrow}>→</Text>
                      <Text style={styles.ruleCategory}>
                        {categoryNameById[rule.category_id] ?? rule.category_id}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.ruleActions}>
                    <Pressable
                      onPress={() =>
                        onSetExpandedRuleId(expandedRuleId === rule.id ? null : rule.id)
                      }
                      style={styles.actionButton}
                    >
                      <Text style={styles.actionIcon}>✎</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onDeleteRule(rule.id)}
                      style={styles.actionButton}
                    >
                      <Text style={styles.deleteIcon}>✕</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Expanded Edit Panel */}
                {expandedRuleId === rule.id && (
                  <View style={styles.editPanel}>
                    <View style={styles.editRow}>
                      <Text style={styles.editLabel}>Type:</Text>
                      <View style={styles.editToggleRow}>
                        <Pressable
                          onPress={() => onUpdateRuleType(rule.id, 'merchant')}
                          style={[
                            styles.editToggle,
                            rule.rule_type === 'merchant' && styles.editToggleActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.editToggleText,
                              rule.rule_type === 'merchant' && styles.editToggleTextActive,
                            ]}
                          >
                            Merchant
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => onUpdateRuleType(rule.id, 'upi_note_keyword')}
                          style={[
                            styles.editToggle,
                            rule.rule_type === 'upi_note_keyword' && styles.editToggleActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.editToggleText,
                              rule.rule_type === 'upi_note_keyword' && styles.editToggleTextActive,
                            ]}
                          >
                            UPI Note
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.editRow}>
                      <Text style={styles.editLabel}>Category:</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryChipsRow}
                      >
                        {categories.map((category) => (
                          <Pressable
                            key={`edit-${rule.id}-${category.id}`}
                            onPress={() => onUpdateRuleCategory(rule.id, category.id)}
                            style={[
                              styles.categoryChip,
                              rule.category_id === category.id && styles.categoryChipSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.categoryChipText,
                                rule.category_id === category.id && styles.categoryChipTextSelected,
                              ]}
                            >
                              {category.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Category Management Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manage Categories</Text>

        <View style={styles.categoryGrid}>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              style={[
                styles.manageCategoryChip,
                selectedCategoryId === category.id && styles.manageCategoryChipSelected,
              ]}
              onPress={() => onSelectCategory(category.id)}
            >
              <Text style={styles.manageCategoryText}>{category.name}</Text>
              {selectedCategoryId === category.id && (
                <Pressable
                  onPress={() => onDeleteCategory(category.id)}
                  hitSlop={8}
                >
                  <Text style={styles.manageCategoryRemove}>✕</Text>
                </Pressable>
              )}
            </Pressable>
          ))}
        </View>

        {/* Add Category */}
        <View style={styles.addCategoryRow}>
          <TextInput
            value={newCategoryName}
            onChangeText={onSetNewCategoryName}
            placeholder="New category name"
            placeholderTextColor={palette.mutedText}
            style={styles.addCategoryInput}
          />
          <Pressable onPress={onCreateCategory} style={styles.addButton}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        {/* Rename Panel */}
        {selectedCategoryId && editingCategoryId !== selectedCategoryId && (
          <View style={styles.renamePanel}>
            <Text style={styles.renamePanelTitle}>
              {categoryNameById[selectedCategoryId]}
            </Text>
            <View style={styles.renamePanelActions}>
              <Pressable
                onPress={() => {
                  onSetEditingCategoryId(selectedCategoryId);
                  onSetEditingCategoryName(categoryNameById[selectedCategoryId] ?? '');
                }}
                style={styles.renamePanelButton}
              >
                <Text style={styles.renamePanelButtonText}>Rename</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Editing Panel */}
        {editingCategoryId && (
          <View style={styles.editCategoryPanel}>
            <TextInput
              value={editingCategoryName}
              onChangeText={onSetEditingCategoryName}
              placeholder="Category name"
              placeholderTextColor={palette.mutedText}
              style={styles.editCategoryInput}
            />
            <View style={styles.editCategoryActions}>
              <Pressable
                onPress={() => onRenameCategory(editingCategoryId)}
                style={styles.saveSmallButton}
              >
                <Text style={styles.saveSmallButtonText}>Save</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onSetEditingCategoryId(null);
                  onSetEditingCategoryName('');
                }}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    padding: 20,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
  },
  ruleCount: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.accent,
    backgroundColor: palette.accentSoftMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Field Groups
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.mutedText,
  },

  // Toggle Buttons
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  toggleButtonActive: {
    backgroundColor: palette.accent,
  },
  toggleIcon: {
    fontSize: 16,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  toggleTextActive: {
    color: palette.surface,
  },

  // Text Input
  textInput: {
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: palette.primaryText,
  },

  // Dropdown
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownText: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.primaryText,
  },
  dropdownPlaceholder: {
    color: palette.mutedText,
  },
  dropdownChevron: {
    fontSize: 14,
    color: palette.mutedText,
  },
  dropdownMenu: {
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  dropdownOption: {
    paddingHorizontal: 16,
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

  // Save Button
  saveButton: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.surface,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  emptyText: {
    fontSize: 13,
    color: palette.mutedText,
    textAlign: 'center',
  },

  // Rules List
  rulesList: {
    gap: 10,
  },
  ruleCard: {
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 12,
    overflow: 'hidden',
  },
  ruleMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  ruleIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleIcon: {
    fontSize: 18,
  },
  ruleContent: {
    flex: 1,
    gap: 2,
  },
  rulePattern: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
  },
  ruleArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleArrow: {
    fontSize: 12,
    color: palette.accent,
  },
  ruleCategory: {
    fontSize: 13,
    color: palette.mutedText,
  },
  ruleActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 16,
    color: palette.mutedText,
  },
  deleteIcon: {
    fontSize: 18,
    color: palette.danger,
  },

  // Edit Panel
  editPanel: {
    backgroundColor: palette.surface,
    padding: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  editRow: {
    gap: 8,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.mutedText,
  },
  editToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editToggle: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: palette.surfaceContainerLow,
  },
  editToggleActive: {
    backgroundColor: palette.accent,
  },
  editToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  editToggleTextActive: {
    color: palette.surface,
  },
  categoryChipsRow: {
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: palette.surfaceContainerLow,
  },
  categoryChipSelected: {
    backgroundColor: palette.accent,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.primaryText,
  },
  categoryChipTextSelected: {
    color: palette.surface,
  },

  // Category Management
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  manageCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 20,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
  },
  manageCategoryChipSelected: {
    backgroundColor: palette.accentSoftMuted,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  manageCategoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },
  manageCategoryRemove: {
    fontSize: 14,
    color: palette.danger,
    fontWeight: '600',
  },

  // Add Category
  addCategoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addCategoryInput: {
    flex: 1,
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: palette.primaryText,
  },
  addButton: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.surface,
  },

  // Rename Panel
  renamePanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    padding: 14,
  },
  renamePanelTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
  },
  renamePanelActions: {
    flexDirection: 'row',
    gap: 8,
  },
  renamePanelButton: {
    backgroundColor: palette.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  renamePanelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.accent,
  },

  // Edit Category Panel
  editCategoryPanel: {
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  editCategoryInput: {
    backgroundColor: palette.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: palette.primaryText,
  },
  editCategoryActions: {
    flexDirection: 'row',
    gap: 10,
  },
  saveSmallButton: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveSmallButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.surface,
  },
  cancelButton: {
    backgroundColor: palette.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.mutedText,
  },
});
