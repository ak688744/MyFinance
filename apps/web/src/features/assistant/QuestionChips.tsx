/**
 * Single-select clarifying-question chips rendered under an assistant bubble.
 * Clicking a chip sends that label as the next user message. Free-text reply is
 * always still possible via the page's input — these chips are a shortcut, not a gate.
 * Once answered (a later user message exists) the chips are replaced by a caption.
 */
export function QuestionChips({
  question,
  options,
  onSelect,
  disabled,
  answeredWith,
}: {
  question: string;
  options: { label: string }[];
  onSelect: (label: string) => void;
  disabled?: boolean;
  answeredWith?: string;
}) {
  return (
    <div className="mt-1">
      <div className="text-[13px] text-ink mb-2">{question}</div>
      {answeredWith !== undefined ? (
        <div className="text-[11px] text-ink-subtle">Replied · {answeredWith}</div>
      ) : (
        options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.label}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(o.label)}
                className="text-xs px-3 py-1.5 rounded-full border border-[#DDD6FE] bg-white text-[#6D28D9] hover:bg-[#F5F3FF] transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-50"
              >
                {o.label}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
