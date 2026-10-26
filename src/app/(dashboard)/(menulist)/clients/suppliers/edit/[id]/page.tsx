'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import SupplierModal from '@/components/clientmanagement/SupplierModal';
import { SkeletonClientProfilePage } from '@/components/skeleton/SkeletonClientProfilePage';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import type { Supplier } from '@/types/client';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';

const SUPPLIER_QUERY = `
  query GetSupplier($userId: Int!, $id: String!) {
    supplier(userId: $userId, id: $id) {
      id
      supplierId
      name
      contact
      email
      phone
      businessType
      address
      status
      logistics
      notes
      supplies
      avgMonthlyPurchaseValue
      totalPurchases
      totalSupplies
      onTimeDeliveryRate
      userId
      createdAt
      updatedAt
    }
  }
`;

export default function EditSupplierPage() {
  const params = useParams();
  const { tSuppliers, tCommon } = useClientsTranslations();
  const tPage = (key: string, values?: Record<string, string | number>) =>
    tSuppliers(`detailsPage.${key}` as Parameters<typeof tSuppliers>[0], values);
  const isHydrated = useUserStore((state) => state.isHydrated);
  const user = useUserStore((state) => state.user);
  const id = typeof params?.id === 'string' ? params.id : undefined;
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchGraphQL<{ supplier: Supplier | null }>(SUPPLIER_QUERY, {
          userId: user.id,
          id,
        });
        if (cancelled) return;
        if (!data.supplier) {
          setError('Supplier not found');
          setSupplier(null);
          return;
        }
        setSupplier(data.supplier);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load supplier');
          setSupplier(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, id]);

  if (!isHydrated || loading) {
    return <SkeletonClientProfilePage />;
  }

  if (!id) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <p className="text-lg font-semibold text-gray-500">{tPage('notFound')}</p>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <p className="text-lg font-semibold text-red-500">{tPage('authRequired')}</p>
        <p className="text-gray-600">{tPage('loginRequired')}</p>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <p className="mb-2 text-lg font-semibold text-red-500">{tPage('errorTitle')}</p>
        <p className="mb-4 text-gray-600">{error || tPage('unexpectedError')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-[#0a61d7] px-4 py-2 text-white transition hover:bg-[#084ba6]"
        >
          {tCommon('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <SupplierModal mode="edit" initialData={supplier} />
    </div>
  );
}
