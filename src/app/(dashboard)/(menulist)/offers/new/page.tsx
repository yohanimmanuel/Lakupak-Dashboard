'use client';

import { Suspense } from 'react';
import { OfferFormPage } from '@/components/offersincentivesdisc/OfferFormPage';
import { SkeletonWizardPage } from '@/components/skeleton/SkeletonWizardPage';

export default function OfferCreatePage() {
  return (
    <Suspense fallback={<SkeletonWizardPage tabs={4} actions={2} />}>
      <OfferFormPage mode="create" />
    </Suspense>
  );
}
