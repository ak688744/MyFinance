import { useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { ArrowRightIcon, CloseIcon } from '../../components/ui/icons';
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

  const handleUpdateRule = async (id: number, ruleType: 'merchant' | 'upi_note_keyword' | 'keyword') => {
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

  const inputCls = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white';
  const addBtn = 'text-sm bg-brand text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50';
  const RULE_TYPE_LABEL: Record<string, string> = { merchant: 'merchant', upi_note_keyword: 'UPI note', keyword: 'keyword' };

  return (
    <Drawer open={open} onClose={onClose} ariaLabel="Categories and rules">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-heading text-[15px] font-semibold text-ink">Categories &amp; rules</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-muted hover:bg-slate-50 cursor-pointer">
          <CloseIcon width={16} height={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* Rules Section */}
        <section>
          <h3 className="font-semibold text-sm mb-3">Rules</h3>
          <div className="flex flex-col gap-1.5 mb-3">
            {rules.isLoading && <div className="text-xs text-gray-500">Loading...</div>}
            {rules.data?.length === 0 && <div className="text-xs text-gray-500">No rules yet.</div>}
            {rules.data?.map((rule) => {
              const category = categories.data?.find((c) => c.id === rule.categoryId);
              return (
                <div key={rule.id} className="flex items-center gap-2 bg-[#F9FAFB] border border-[#F1F5F9] rounded-lg px-2.5 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono tabular text-[13px] truncate">{rule.patternValue}</div>
                    <div className="text-[10px] text-gray-400">{RULE_TYPE_LABEL[rule.ruleType] ?? rule.ruleType}</div>
                  </div>
                  <ArrowRightIcon width={14} height={14} className="text-brand shrink-0" />
                  {editingRuleId === rule.id ? (
                    <>
                      <select
                        value={editingRuleCategoryId}
                        onChange={(e) => setEditingRuleCategoryId(e.target.value)}
                        className={`${inputCls} py-1`}
                        autoFocus
                      >
                        <option value="">Select category</option>
                        {categories.data?.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button onClick={() => handleUpdateRule(rule.id, rule.ruleType)} className="text-xs text-brand hover:underline" disabled={updateRule.isPending}>Save</button>
                      <button onClick={() => setEditingRuleId(null)} className="text-xs text-gray-600 hover:underline">Cancel</button>
                    </>
                  ) : (
                    <button
                      type="button"
                      title="Click to change category"
                      onClick={() => { setEditingRuleId(rule.id); setEditingRuleCategoryId(rule.categoryId); }}
                      className="text-xs bg-[#F3F4F6] text-[#374151] rounded-md px-2 py-1 cursor-pointer hover:bg-gray-200"
                    >
                      {category?.name ?? rule.categoryId}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete rule ${rule.patternValue}`}
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-gray-400 hover:text-loss cursor-pointer"
                  >
                    <CloseIcon width={14} height={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <form onSubmit={handleCreateRule} className="flex items-center gap-2">
            <select
              aria-label="Rule type"
              value={newRuleType}
              onChange={(e) => setNewRuleType(e.target.value as 'merchant' | 'upi_note_keyword')}
              className={`${inputCls} w-[84px] shrink-0`}
            >
              <option value="merchant">Merchant</option>
              <option value="upi_note_keyword">UPI note</option>
            </select>
            <input
              type="text"
              placeholder="e.g. swiggy"
              value={newRulePattern}
              onChange={(e) => setNewRulePattern(e.target.value)}
              className={`${inputCls} flex-1 min-w-0`}
            />
            <select
              aria-label="Rule category"
              value={newRuleCategoryId}
              onChange={(e) => setNewRuleCategoryId(e.target.value)}
              className={`${inputCls} w-[110px] shrink-0`}
            >
              <option value="">Category</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="submit" className={addBtn} disabled={createRule.isPending || !newRulePattern.trim() || !newRuleCategoryId}>
              Add
            </button>
          </form>
          {createRule.error && <div className="text-xs text-red-600 mt-1">Failed to create rule</div>}
        </section>

        {/* Categories Section */}
        <section>
          <h3 className="font-semibold text-sm mb-3">Categories</h3>
          {categories.isLoading && <div className="text-xs text-gray-500">Loading...</div>}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {categories.data?.map((cat) =>
              editingCategoryId === cat.id ? (
                <span key={cat.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    className={`${inputCls} py-1 w-32`}
                    autoFocus
                  />
                  <button onClick={() => handleRenameCategory(cat.id)} className="text-xs text-brand hover:underline" disabled={renameCategory.isPending}>Save</button>
                  <button onClick={() => setEditingCategoryId(null)} className="text-xs text-gray-600 hover:underline">Cancel</button>
                </span>
              ) : deletingCategoryId === cat.id ? (
                <span key={cat.id} className="flex items-center gap-1.5 text-xs rounded-full bg-red-50 border border-red-200 px-2.5 py-1">
                  Delete {cat.name}?
                  <button onClick={() => handleDeleteCategory(cat.id)} className="text-loss font-medium hover:underline" disabled={deleteCategory.isPending}>Confirm</button>
                  <button onClick={() => setDeletingCategoryId(null)} className="text-gray-600 hover:underline">Cancel</button>
                </span>
              ) : (
                <span key={cat.id} className="flex items-center gap-1 text-[13px] rounded-full bg-[#F3F4F6] text-[#374151] pl-2.5 pr-1.5 py-1">
                  <button
                    type="button"
                    title="Click to rename"
                    onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }}
                    className="cursor-pointer hover:underline"
                  >
                    {cat.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete category ${cat.name}`}
                    onClick={() => setDeletingCategoryId(cat.id)}
                    className="text-gray-400 hover:text-loss cursor-pointer"
                  >
                    <CloseIcon width={12} height={12} />
                  </button>
                </span>
              ),
            )}
          </div>
          <form onSubmit={handleCreateCategory} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className={`${inputCls} flex-1`}
            />
            <button type="submit" className={addBtn} disabled={createCategory.isPending || !newCategoryName.trim()}>
              Add
            </button>
          </form>
          {createCategory.error && (
            <div className="text-xs text-red-600 mt-1">
              {createCategory.error instanceof Error && createCategory.error.message.includes('409')
                ? 'Category already exists'
                : 'Failed to create category'}
            </div>
          )}
        </section>
      </div>
      <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">Re-applies rules to all non-manual transactions.</div>
        <button
          onClick={handleRecategorize}
          className="text-sm border border-[#DDD6FE] text-[#6D28D9] rounded-lg px-3 py-1.5 hover:bg-[#F5F3FF] disabled:opacity-50 shrink-0"
          disabled={recategorize.isPending}
        >
          Recategorize all
        </button>
      </div>
    </Drawer>
  );
}
