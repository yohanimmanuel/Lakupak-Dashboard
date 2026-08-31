import { DocsHeader } from '@/components/docs/DocsHeader';
import type { Metadata } from 'next';
import { DOCS_VIEWPORT_CALC } from '@/lib/docs/headerHeight';

export const metadata: Metadata = {
  title: 'Documentation | Lakupak',
  description: 'Lakupak platform documentation for Dashboard, Marketplace, and Driver.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 antialiased">
      <DocsHeader />
      <div style={{ minHeight: DOCS_VIEWPORT_CALC }}>
        {children}
      </div>
    </div>
  );
}
