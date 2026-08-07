'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Compact markdown for Laku AI chat bubbles (headings, bold, lists, tables, links). */
export function AiChatMarkdown({
  content,
  size = 'sm',
}: {
  content: string;
  size?: 'sm' | 'md';
}) {
  const body = size === 'md' ? 'text-sm' : 'text-xs';
  const h = size === 'md' ? 'text-base' : 'text-sm';
  const h3 = size === 'md' ? 'text-sm' : 'text-xs';
  const table = size === 'md' ? 'text-xs' : 'text-[11px]';

  return (
    <div className={`ai-chat-md ${body} leading-relaxed text-gray-800 [&_:first-child]:mt-0 [&_:last-child]:mb-0`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className={`mt-2 mb-1 ${h} font-semibold text-gray-900`}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className={`mt-2 mb-1 ${h} font-semibold text-gray-900`}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className={`mt-1.5 mb-1 ${h3} font-semibold text-gray-900`}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className={`mt-1.5 mb-0.5 ${h3} font-semibold text-gray-900`}>{children}</h4>
          ),
          p: ({ children }) => <p className="my-1.5 whitespace-pre-wrap">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-1.5 list-disc space-y-0.5 pl-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#0a61d7] underline-offset-2 hover:underline break-all"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-md bg-white/80 px-2 py-1.5 text-[11px] text-gray-800">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-white/80 px-1 py-0.5 text-[11px] text-gray-800">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-1.5 overflow-x-auto rounded-md bg-white/80 p-0">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 border-[#0a61d7]/40 pl-2 text-gray-600">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2 border-gray-200" />,
          table: ({ children }) => (
            <div className="my-1.5 overflow-x-auto rounded-md border border-gray-200 bg-white/60">
              <table className={`min-w-full border-collapse ${table}`}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-gray-200 px-2 py-1 text-left font-semibold text-gray-800">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-gray-100 px-2 py-1 align-top text-gray-700">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
