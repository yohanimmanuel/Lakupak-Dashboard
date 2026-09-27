'use client';

import { Suspense } from 'react';
import ClientMatchingQueue from '@/components/clientmanagement/ClientMatchingQueue';

export default function BuyerMatchingPage() {
  return (
    <Suspense fallback={null}>
      <ClientMatchingQueue />
    </Suspense>
  );
}
