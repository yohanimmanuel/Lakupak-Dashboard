import { DocsHeader } from '@/components/docs/DocsHeader';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation | Laku',
  description: 'Laku platform documentation for Dashboard, Marketplace, and Driver.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 antialiased">
      <DocsHeader />
      {children}
    </div>
  );
}
