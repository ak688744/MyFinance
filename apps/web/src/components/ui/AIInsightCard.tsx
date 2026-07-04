export function AIInsightCard({ text }: { text: string }) {
  return (
    <div className="border-l-4 border-ai bg-ai/5 rounded-card p-4">
      <div className="flex items-center gap-2 text-ai text-xs font-semibold uppercase">
        <span>AI Insight</span><span className="text-[10px] bg-ai/10 px-1.5 py-0.5 rounded">BETA</span>
      </div>
      <p className="text-sm text-gray-700 mt-1">{text}</p>
      <button disabled className="text-xs text-ai/60 mt-2 cursor-not-allowed">Ask the assistant · Coming in L4</button>
    </div>
  );
}
