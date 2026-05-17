'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';

export function DocsMarkdown({ content }: { content: string }) {
  return (
    <article className="prose prose-slate max-w-none font-sans prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-gray-900 prose-h2:text-2xl prose-h3:text-xl prose-p:text-base prose-p:leading-7 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-a:text-[#0a61d7] prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-[#0a61d7] prose-blockquote:bg-gray-50 prose-blockquote:text-gray-700 prose-blockquote:font-normal">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
