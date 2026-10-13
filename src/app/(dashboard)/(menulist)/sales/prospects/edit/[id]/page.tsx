'use client';

import { useParams } from 'next/navigation';
import ProspectForm from '@/components/sales/ProspectForm';

export default function EditProspectPage() {
  const params = useParams();
  const buyerId = typeof params?.id === 'string' ? params.id : '';
  return <ProspectForm buyerId={buyerId} />;
}
