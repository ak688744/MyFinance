import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders assistant markdown (GitHub-flavoured: tables, lists, headings, code).
 * Styled to fit the chat bubble — compact spacing, scrollable tables.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="font-heading font-semibold text-base mt-3 mb-1.5 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="font-heading font-semibold text-sm mt-3 mb-1.5 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="font-heading font-semibold text-sm mt-2 mb-1 first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="marker:text-ink-muted">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">{children}</a>
          ),
          hr: () => <hr className="my-2 border-border" />,
          // Block code fences render as a single scrollable monospace panel.
          // Inline code (no surrounding <pre>) keeps the small pill styling.
          pre: ({ children }) => (
            <pre className="my-2 p-2.5 rounded-lg bg-canvas border border-border overflow-x-auto text-[11px] leading-snug font-mono whitespace-pre">{children}</pre>
          ),
          code: ({ children, className }) => {
            // Block code = has a language class OR spans multiple lines (covers
            // language-less ``` fences, e.g. ASCII boxes). react-markdown v9
            // dropped the `inline` prop, so we infer it.
            const hasLang = typeof className === 'string' && className.includes('language-');
            const isMultiline = typeof children === 'string' && children.includes('\n');
            if (hasLang || isMultiline) {
              // Inside <pre>: no pill borders/padding — the <pre> owns the panel.
              return <code className={`${className ?? ''} font-mono`}>{children}</code>;
            }
            return (
              <code className="px-1 py-0.5 rounded bg-canvas border border-border text-[0.85em] font-mono">{children}</code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 my-2 text-ink-muted">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
          th: ({ children }) => <th className="text-left font-semibold px-2 py-1.5 align-top">{children}</th>,
          td: ({ children }) => <td className="px-2 py-1.5 align-top border-t border-border/60">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
