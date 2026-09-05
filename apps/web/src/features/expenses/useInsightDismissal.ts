import { useCallback, useState } from 'react';

const KEY = 'myfinance.expense.insights.dismissed.v1';

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function useInsightDismissal() {
  const [dismissed, setDismissed] = useState<Set<string>>(load);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }, []);

  const isDismissed = useCallback((id: string) => dismissed.has(id), [dismissed]);

  return { dismissed, dismiss, isDismissed };
}
