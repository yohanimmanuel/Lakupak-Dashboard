'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import BuyerModal from '@/components/clientmanagement/BuyerModal';
import { useLakuAiPanel } from '@/components/lakuAi/LakuAiPanelContext';
import { SkeletonClientProfilePage } from '@/components/skeleton/SkeletonClientProfilePage';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import type { Buyer } from '@/types/client';
import type { ProspectFormFill } from '@/lib/salesJobs/prospectFormFill';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import {
  mapProspectFillToBuyer,
  peekPendingProspectFill,
  PENDING_PROSPECT_FILL_EVENT,
  takePendingProspectFill,
  writePendingProspectFill,
} from '@/lib/lakuAi/pendingProspectFill';

const BUYER_QUERY = `
  query GetBuyer($userId: Int!, $id: String!) {
    buyer(userId: $userId, id: $id) {
      id
      buyerId
      avatar
      owner
      storeName
      email
      phone
      businessType
      address
      status
      logistics
      notes
      orderDetails
      avgMonthlySpending
      avgMonthlyOrders
      userId
      createdAt
      updatedAt
    }
  }
`;

export default function EditBuyerPage() {
  const params = useParams();
  const router = useRouter();
  const { tBuyers, tBuyersModal, tCommon } = useClientsTranslations();
  const tPage = (key: string, values?: Record<string, string | number>) =>
    tBuyers(`detailsPage.${key}` as Parameters<typeof tBuyers>[0], values);
  const { registerProspectAi, unregisterProspectAi } = useLakuAiPanel();
  const isHydrated = useUserStore((state) => state.isHydrated);
  const user = useUserStore((state) => state.user);
  const id = typeof params?.id === 'string' ? params.id : undefined;
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiApplying, setAiApplying] = useState(false);
  const appliedFillRef = useRef(false);
  const applySeqRef = useRef(0);
  const buyerRef = useRef(buyer);
  buyerRef.current = buyer;

  const mergeFillOntoBuyer = useCallback((base: Buyer, fill: ProspectFormFill): Buyer => {
    const mapped = mapProspectFillToBuyer(fill);
    return {
      ...base,
      ...mapped,
      id: base.id,
      buyerId: base.buyerId,
      // Keep existing CRM fields when the fill left them blank.
      owner: mapped.owner || base.owner,
      storeName: mapped.storeName || base.storeName,
      phone: mapped.phone || base.phone,
      address: mapped.address || base.address,
      businessType: mapped.businessType || base.businessType,
      notes: mapped.notes || base.notes,
      email: mapped.email || base.email,
      status: mapped.status || base.status,
    };
  }, []);

  const takeFillForBuyer = useCallback(
    (base: Buyer) => {
      const pending = peekPendingProspectFill();
      if (!pending?.buyerId) return base;
      if (pending.buyerId !== base.buyerId && pending.buyerId !== id) return base;
      const taken = takePendingProspectFill();
      return taken ? mergeFillOntoBuyer(base, taken) : base;
    },
    [id, mergeFillOntoBuyer],
  );

  const applyFill = useCallback(
    async (fill: ProspectFormFill) => {
      const current = buyerRef.current;
      const matches =
        Boolean(fill.buyerId) &&
        Boolean(current) &&
        (fill.buyerId === current?.buyerId || fill.buyerId === id);
      if (!matches) {
        writePendingProspectFill(fill);
        if (fill.buyerId) {
          router.push(`/clients/buyers/edit/${encodeURIComponent(fill.buyerId)}`);
        } else {
          router.push('/clients/buyers/add');
        }
        return;
      }
      const seq = ++applySeqRef.current;
      setAiApplying(true);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      if (seq !== applySeqRef.current) return;
      setBuyer((row) => (row ? mergeFillOntoBuyer(row, fill) : row));
      setAiApplying(false);
    },
    [id, mergeFillOntoBuyer, router],
  );

  useEffect(() => {
    appliedFillRef.current = false;
  }, [id]);

  useEffect(() => {
    registerProspectAi({ applyFill });
    return () => unregisterProspectAi();
  }, [registerProspectAi, unregisterProspectAi, applyFill]);

  useEffect(() => {
    if (!user?.id || !id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchGraphQL<{ buyer: Buyer | null }>(BUYER_QUERY, {
          userId: user.id,
          id,
        });
        if (cancelled) return;
        if (!data.buyer) {
          setError('Buyer not found');
          setBuyer(null);
          return;
        }
        let next = data.buyer;
        if (!appliedFillRef.current) {
          appliedFillRef.current = true;
          next = takeFillForBuyer(next);
        }
        setBuyer(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load buyer');
          setBuyer(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, id, takeFillForBuyer]);

  useEffect(() => {
    const applyPending = () => {
      const pending = peekPendingProspectFill();
      if (!pending?.buyerId) return;
      const current = buyerRef.current;
      if (!current) return;
      if (pending.buyerId !== current.buyerId && pending.buyerId !== id) return;
      const taken = takePendingProspectFill();
      if (!taken) return;
      void applyFill(taken);
    };
    window.addEventListener(PENDING_PROSPECT_FILL_EVENT, applyPending);
    return () => window.removeEventListener(PENDING_PROSPECT_FILL_EVENT, applyPending);
  }, [applyFill, id]);

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

  if (error || !buyer) {
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
    <div className="relative flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      {aiApplying ? (
        <div
          className="absolute inset-0 z-[35] flex items-center justify-center bg-white/50"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[#0a61d7]" />
            <span className="text-sm font-medium text-black">{tBuyersModal('applyingFill')}</span>
          </div>
        </div>
      ) : null}
      <BuyerModal mode="edit" initialData={buyer} />
    </div>
  );
}
