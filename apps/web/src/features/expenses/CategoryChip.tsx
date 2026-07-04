import { useState } from 'react';
import { useUpdateTxCategory } from '../../lib/hooks';

type CategoryChipProps = {
  txId: number;
  categoryId: string | null;
  merchantLabel: string;
  categories: { id: string; name: string }[];
  categorySource?: string | null;
  aiKeyword?: string;
};

export function CategoryChip({ txId, categoryId, merchantLabel, categories, categorySource, aiKeyword }: CategoryChipProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [showLearnPrompt, setShowLearnPrompt] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const updateTxCategory = useUpdateTxCategory();

  const currentCategory = categoryId ? categories.find((c) => c.id === categoryId) : null;
  const selectedCategory = selectedCategoryId ? categories.find((c) => c.id === selectedCategoryId) : null;

  const handleCategorySelect = async (newCategoryId: string) => {
    setIsPickerOpen(false);
    setSelectedCategoryId(newCategoryId);

    try {
      await updateTxCategory.mutateAsync({ id: txId, categoryId: newCategoryId });
      setShowLearnPrompt(true);
    } catch (err) {
      console.error('Failed to update category:', err);
    }
  };

  const handleLearnYes = async () => {
    try {
      await updateTxCategory.mutateAsync({ id: txId, categoryId: selectedCategoryId, createRuleMerchant: true });
      setShowLearnPrompt(false);
      setSelectedCategoryId(null);
    } catch (err) {
      console.error('Failed to create rule:', err);
    }
  };

  const handleLearnNo = () => {
    setShowLearnPrompt(false);
    setSelectedCategoryId(null);
  };

  const handleAiConfirm = async () => {
    if (categoryId === null) return;
    await updateTxCategory.mutateAsync({ id: txId, categoryId });
    if (aiKeyword && aiKeyword.trim().length >= 2) setAiConfirmed(true);
  };

  const handleAiKeywordYes = async () => {
    if (categoryId === null) return;
    await updateTxCategory.mutateAsync({ id: txId, categoryId, createRuleKeyword: true, keyword: aiKeyword });
    setAiConfirmed(false);
  };

  const handleAiKeywordNo = () => setAiConfirmed(false);

  const handleAiReject = async () => {
    await updateTxCategory.mutateAsync({ id: txId, categoryId: null });
  };

  if (categorySource === 'ai_suggested' && currentCategory) {
    if (aiConfirmed) {
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Always categorize transactions containing "{aiKeyword}" as {currentCategory.name}?</span>
          <button onClick={handleAiKeywordYes} disabled={updateTxCategory.isPending} className="text-violet-700 font-medium px-1">Yes</button>
          <span className="text-gray-400">/</span>
          <button onClick={handleAiKeywordNo} disabled={updateTxCategory.isPending} className="text-gray-600 px-1">No</button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded px-2 py-0.5">
          AI · {currentCategory.name}
        </span>
        <button aria-label="Confirm AI suggestion" onClick={handleAiConfirm} disabled={updateTxCategory.isPending} className="text-green-600 px-1">✓</button>
        <button aria-label="Reject AI suggestion" onClick={handleAiReject} disabled={updateTxCategory.isPending} className="text-red-600 px-1">✗</button>
      </div>
    );
  }

  if (showLearnPrompt && selectedCategory) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs bg-gray-100 rounded px-2 py-0.5">{selectedCategory.name}</span>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-600">Always categorize "{merchantLabel}" as {selectedCategory.name}?</span>
          <button
            onClick={handleLearnYes}
            className="text-blue-600 hover:text-blue-800 font-medium px-1"
            disabled={updateTxCategory.isPending}
          >
            Yes
          </button>
          <span className="text-gray-400">/</span>
          <button
            onClick={handleLearnNo}
            className="text-gray-600 hover:text-gray-800 px-1"
            disabled={updateTxCategory.isPending}
          >
            No
          </button>
        </div>
      </div>
    );
  }

  if (isPickerOpen) {
    return (
      <div className="flex items-center gap-2">
        <select
          autoFocus
          className="text-xs bg-white border border-gray-300 rounded px-2 py-0.5"
          value={categoryId ?? ''}
          onChange={(e) => handleCategorySelect(e.target.value)}
          onBlur={() => setIsPickerOpen(false)}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {updateTxCategory.error && (
          <span className="text-xs text-red-600">Failed</span>
        )}
      </div>
    );
  }

  if (!categoryId) {
    return (
      <button
        onClick={() => setIsPickerOpen(true)}
        className="text-xs border border-dashed border-amber-400 text-amber-700 bg-amber-50 rounded px-2 py-0.5 hover:bg-amber-100 transition-colors"
      >
        Uncategorized
      </button>
    );
  }

  return (
    <button
      onClick={() => setIsPickerOpen(true)}
      className="text-xs bg-gray-100 rounded px-2 py-0.5 hover:bg-gray-200 transition-colors"
    >
      {currentCategory?.name ?? categoryId}
    </button>
  );
}
