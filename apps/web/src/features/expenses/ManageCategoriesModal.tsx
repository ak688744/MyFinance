import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import {
  useCategories, useRules, useCreateCategory, useRenameCategory, useDeleteCategory,
  useCreateRule, useUpdateRule, useDeleteRule, useRecategorize,
} from '../../lib/hooks';

type ManageCategoriesModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ManageCategoriesModal({ open, onClose }: ManageCategoriesModalProps) {
  const categories = useCategories();
  const rules = useRules();
  const createCategory = useCreateCategory();
  const renameCategory = useRenameCategory();
  const deleteCategory = useDeleteCategory();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const recategorize = useRecategorize();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  const [newRuleType, setNewRuleType] = useState<'merchant' | 'upi_note_keyword'>('merchant');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleCategoryId, setNewRuleCategoryId] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editingRuleCategoryId, setEditingRuleCategoryId] = useState('');

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await createCategory.mutateAsync({ name: newCategoryName.trim() });
      setNewCategoryName('');
    } catch (err) {
      console.error('Failed to create category:', err);
    }
  };

  const handleRenameCategory = async (id: string) => {
    if (!editingCategoryName.trim()) return;
    try {
      await renameCategory.mutateAsync({ id, name: editingCategoryName.trim() });
      setEditingCategoryId(null);
      setEditingCategoryName('');
    } catch (err) {
      console.error('Failed to rename category:', err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteCategory.mutateAsync(id);
      setDeletingCategoryId(null);
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRulePattern.trim() || !newRuleCategoryId) return;
    try {
      await createRule.mutateAsync({
        ruleType: newRuleType,
        patternValue: newRulePattern.trim(),
        categoryId: newRuleCategoryId,
      });
      setNewRulePattern('');
      setNewRuleCategoryId('');
    } catch (err) {
      console.error('Failed to create rule:', err);
    }
  };

  const handleUpdateRule = async (id: number, ruleType: 'merchant' | 'upi_note_keyword') => {
    if (!editingRuleCategoryId) return;
    try {
      await updateRule.mutateAsync({ id, categoryId: editingRuleCategoryId, ruleType });
      setEditingRuleId(null);
      setEditingRuleCategoryId('');
    } catch (err) {
      console.error('Failed to update rule:', err);
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await deleteRule.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  const handleRecategorize = async () => {
    try {
      await recategorize.mutateAsync();
    } catch (err) {
      console.error('Failed to recategorize:', err);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Categories & Rules">
      <div className="flex flex-col gap-6">
        {/* Categories Section */}
        <div>
          <h3 className="font-semibold text-sm mb-3">Categories</h3>
          <div className="flex flex-col gap-2 mb-3">
            {categories.isLoading && <div className="text-xs text-gray-500">Loading...</div>}
            {categories.data?.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                {editingCategoryId === cat.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRenameCategory(cat.id)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                      disabled={renameCategory.isPending}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingCategoryId(null)}
                      className="text-xs text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span>{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingCategoryId(cat.id);
                          setEditingCategoryName(cat.name);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Rename
                      </button>
                      {deletingCategoryId === cat.id ? (
                        <>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="text-xs text-red-600 hover:text-red-800"
                            disabled={deleteCategory.isPending}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletingCategoryId(null)}
                            className="text-xs text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeletingCategoryId(cat.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={handleCreateCategory} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
            />
            <button
              type="submit"
              className="text-sm bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700"
              disabled={createCategory.isPending || !newCategoryName.trim()}
            >
              + Add
            </button>
          </form>
          {createCategory.error && (
            <div className="text-xs text-red-600 mt-1">
              {createCategory.error instanceof Error && createCategory.error.message.includes('409')
                ? 'Category already exists'
                : 'Failed to create category'}
            </div>
          )}
        </div>

        {/* Rules Section */}
        <div>
          <h3 className="font-semibold text-sm mb-3">Rules</h3>
          <div className="flex flex-col gap-2 mb-3">
            {rules.isLoading && <div className="text-xs text-gray-500">Loading...</div>}
            {rules.data?.map((rule) => {
              const category = categories.data?.find((c) => c.id === rule.categoryId);
              return (
                <div key={rule.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                  {editingRuleId === rule.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-gray-500">{rule.ruleType} · {rule.patternValue} →</span>
                      <select
                        value={editingRuleCategoryId}
                        onChange={(e) => setEditingRuleCategoryId(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        autoFocus
                      >
                        <option value="">Select category</option>
                        {categories.data?.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleUpdateRule(rule.id, rule.ruleType)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                        disabled={updateRule.isPending}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingRuleId(null)}
                        className="text-xs text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs">
                        <span className="text-gray-500">{rule.ruleType}</span> · {rule.patternValue} → {category?.name ?? rule.categoryId}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingRuleId(rule.id);
                            setEditingRuleCategoryId(rule.categoryId);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <form onSubmit={handleCreateRule} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <select
                value={newRuleType}
                onChange={(e) => setNewRuleType(e.target.value as 'merchant' | 'upi_note_keyword')}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="merchant">Merchant</option>
                <option value="upi_note_keyword">UPI Note Keyword</option>
              </select>
              <input
                type="text"
                placeholder="Pattern value"
                value={newRulePattern}
                onChange={(e) => setNewRulePattern(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
              />
              <select
                value={newRuleCategoryId}
                onChange={(e) => setNewRuleCategoryId(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="">Category</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="submit"
                className="text-sm bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700"
                disabled={createRule.isPending || !newRulePattern.trim() || !newRuleCategoryId}
              >
                + Add
              </button>
            </div>
          </form>
          {createRule.error && (
            <div className="text-xs text-red-600 mt-1">Failed to create rule</div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={handleRecategorize}
              className="text-sm bg-violet-600 text-white rounded px-3 py-1 hover:bg-violet-700"
              disabled={recategorize.isPending}
            >
              Recategorize All
            </button>
            <div className="text-xs text-gray-500 mt-1">Re-applies rules to all non-manual transactions.</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
