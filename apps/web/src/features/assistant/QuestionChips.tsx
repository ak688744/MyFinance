/**
 * Single-select clarifying-question chips rendered under an assistant bubble.
 * Clicking a chip sends that label as the next user message. Free-text reply is
 * always still possible via the page's input — these chips are a shortcut, not a gate.
 */
export function QuestionChips({
  question,
  options,
  onSelect,
  disabled,
}: {
  question: string;
  options: { label: string }[];
  onSelect: (label: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-1">
      <div className="text-sm text-ink mb-2">{question}</div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(o.label)}
              className="text-xs px-3 py-1.5 rounded-full border border-ai/30 bg-ai/5 text-ai hover:bg-ai/10 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
