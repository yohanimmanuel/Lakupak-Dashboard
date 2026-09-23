'use client';

import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
import OfferStatCards from '@/components/offersincentivesdisc/OfferStatCards';
import OfferTable from '@/components/offersincentivesdisc/OfferTable';
import { useRouter } from 'next/navigation';
import { Offer } from '@/types/offer';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { usePendingDashboardTourStart } from '@/hooks/usePendingDashboardTourStart';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';

const OFFERS_QUERY = `
  query GetOffers($userId: Int!, $page: Int, $limit: Int, $status: String) {
    offers(userId: $userId, page: $page, limit: $limit, status: $status) {
      nodes {
        id
        offerId
        groupId
        buyerId
        buyerStoreName
        buyerOwner
        productId
        productName
        categoryId
        categoryLabel
        variantOptionId
        variantName
        discountType
        discountValue
        buyQuantity
        freeQuantity
        startDate
        endDate
        status
        notes
        description
        totalUsage
        totalDiscountGiven
        createdAt
        updatedAt
      }
      pagination {
        totalCount
        totalPages
        page
        limit
      }
    }
  }
`;

export default function OffersPage() {
  const router = useRouter();
  const { user } = useUserStore();
  const { tList } = useOffersTranslations();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  usePendingDashboardTourStart('offers', { ready: hasLoaded && !!user?.id });

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
      if (!user?.id) {
        setOffers([]);
        return;
      }

      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const all: Offer[] = [];

      do {
        const data = await fetchGraphQL<{
          offers: {
            nodes: Offer[];
            pagination: { totalPages?: number };
          };
        }>(OFFERS_QUERY, { userId: user.id, page, limit: pageSize });

        all.push(...(data.offers?.nodes ?? []));
        totalPages = Math.max(1, data.offers?.pagination?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages);

      setOffers(all);
    } catch (error) {
      console.error('Failed to fetch offers:', error);
      setOffers([]);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  if (loading && !hasLoaded) {
    return <SkeletonTablePage />;
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{tList('title')}</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchOffers()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e6e6e6] text-black rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            {tList('refresh')}
          </button>
          <button
            type="button"
            onClick={() => router.push('/offers/new')}
            className="flex items-center gap-2 px-6 py-2 bg-[#0a61d7] font-semibold text-white rounded-lg hover:bg-[#0851b8] transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            {tList('createOffer')}
          </button>
        </div>
      </div>

      <OfferStatCards offers={offers} />

      <OfferTable
        offers={offers}
        setOffersAction={setOffers}
        onRefreshAction={fetchOffers}
      />
    </div>
  );
}
