import { Link } from 'react-router-dom';

export function AIInsightCard({ text, ctaHref = '/assistant' }: { text: string; ctaHref?: string }) {
  return (
    <div className="border border-ai/20 border-l-4 border-l-ai bg-gradient-to-r from-ai/5 to-transparent rounded-card p-4 transition-shadow duration-200 hover:shadow-card">
      <div className="flex items-center gap-2 text-ai text-xs font-semibold uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-ai animate-pulse" aria-hidden />
        <span>AI Insight</span>
        <span className="text-[10px] bg-ai/10 px-1.5 py-0.5 rounded font-bold">LIVE</span>
      </div>
      <p className="text-sm text-ink-muted mt-2 leading-relaxed">{text}</p>
      <Link
        to={ctaHref}
        className="inline-flex items-center gap-1 text-xs font-medium text-ai mt-3 hover:text-ai/80 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai rounded"
      >
        Ask the assistant →
      </Link>
    </div>
  );
}
