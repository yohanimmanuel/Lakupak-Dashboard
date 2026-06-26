import type { Metadata } from 'next';
import { Suspense } from 'react';
import CampaignShareIntlProvider from '@/components/salesmarketing/CampaignShareIntlProvider';

export const metadata: Metadata = {
  title: 'Laku | Marketing Campaign',
};

export default function CampaignShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <CampaignShareIntlProvider>{children}</CampaignShareIntlProvider>
    </Suspense>
  );
}
