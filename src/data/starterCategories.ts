export type StarterCategory = {
  id: string;
  name: string;
  icon: string;
};

export const starterCategories: StarterCategory[] = [
  { id: 'food', name: 'Food', icon: '🍽' },
  { id: 'groceries', name: 'Groceries', icon: '🛒' },
  { id: 'transport', name: 'Transport', icon: '🚕' },
  { id: 'shopping', name: 'Shopping', icon: '🛍' },
  { id: 'investment', name: 'Investment', icon: '📈' },
  { id: 'loan', name: 'Loan', icon: '🏦' },
  { id: 'bills', name: 'Bills', icon: '💡' },
  { id: 'health', name: 'Health', icon: '🩺' },
  { id: 'travel', name: 'Travel', icon: '✈️' },
  { id: 'transfer', name: 'Transfer', icon: '🔁' },
];
