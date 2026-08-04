import { Card } from '../../components/ui/primitives';
import type { Insight } from '../../types';

export function InsightCards({
  insights,
  isDismissed,
  onDismiss,
  onOpen,
}: {
  insights: Insight[];
  isDismissed: (id: string) => boolean;
  onDismiss: (id: string) => void;
  onOpen: (insight: Insight) => void;
}) {
  const visible = insights.filter((i) => !isDismissed(i.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {visible.map((insight) => (
        <Card key={insight.id} className="bg-violet-50 border-violet-200">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <div className="text-sm font-semibold text-violet-900 mb-1">
                {insight.title}
              </div>
              <div className="text-xs text-violet-700 mb-2">
                {insight.detail}
              </div>
              <button
                onClick={() => onOpen(insight)}
                className="text-xs bg-violet-600 text-white rounded px-3 py-1.5 hover:bg-violet-700 transition-colors"
              >
                {insight.cta.label}
              </button>
            </div>
            <button
              onClick={() => onDismiss(insight.id)}
              className="text-violet-500 hover:text-violet-700 text-lg leading-none"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
