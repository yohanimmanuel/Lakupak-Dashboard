'use client';

import { useParams } from 'next/navigation';
import CreateOrderForm from '@/components/ordershipment/CreateOrderForm';

export default function EditOrderPage() {
  const params = useParams();
  const orderId = typeof params?.id === 'string' ? params.id : '';
  return <CreateOrderForm orderId={orderId} />;
}
