'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Check, Users } from 'lucide-react';
import type { OfferWizardFormData } from './OfferDiscountTypeTab';
import { useOffersTranslations } from '@/hooks/useOffersTranslations';
import OfferPickerPagination, {
  usePagedSlice,
} from './OfferPickerPagination';

export type BuyerOption = {
  buyerId: string;
  storeName: string;
  owner: string;
};

type Props = {
  formData: OfferWizardFormData;
  onFormChangeAction: (updates: Partial<OfferWizardFormData>) => void;
  buyers: BuyerOption[];
};

export default function OfferClientTab({
  formData,
  onFormChangeAction,
  buyers,
}: Props) {
  const { tCreatePage, tTable } = useOffersTranslations();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return buyers;
    return buyers.filter(
      (b) =>
        b.storeName.toLowerCase().includes(q) ||
        b.owner.toLowerCase().includes(q) ||
        b.buyerId.toLowerCase().includes(q),
    );
  }, [buyers, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { paged, total, totalPages, safePage, fromRow, toRow } = usePagedSlice(
    filtered,
    page,
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {tCreatePage('clientTabTitle')}
        </h3>
        <p className="text-sm text-gray-500">{tCreatePage('clientTabSubtitle')}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tCreatePage('searchClients')}
          className="w-full pl-10 pr-4 py-2 text-xs text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-500">{tCreatePage('noClients')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-100 text-gray-500 whitespace-nowrap">
                <tr>
                  <th className="py-3 px-4 font-medium uppercase w-10" />
                  <th className="py-3 px-4 font-medium uppercase text-left">
                    {tCreatePage('client')}
                  </th>
                  <th className="py-3 px-4 font-medium uppercase text-left">
                    {tCreatePage('owner')}
                  </th>
                  <th className="py-3 px-4 font-medium uppercase text-left">
                    {tCreatePage('clientId')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {paged.map((b) => {
                  const selected = formData.buyerId === b.buyerId;
                  return (
                    <tr
                      key={b.buyerId}
                      onClick={() => onFormChangeAction({ buyerId: b.buyerId })}
                      className={`border-b cursor-pointer transition ${
                        selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <span
                          className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                            selected
                              ? 'bg-green-500 border-green-500'
                              : 'bg-white border-gray-300'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-black">{b.storeName}</td>
                      <td className="py-3 px-4 text-gray-700">{b.owner}</td>
                      <td className="py-3 px-4 text-gray-500">{b.buyerId}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <OfferPickerPagination
            page={safePage}
            totalPages={totalPages}
            total={total}
            showingLabel={tTable('pagination.showing', {
              from: String(fromRow),
              to: String(toRow),
              total: String(total),
            })}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
