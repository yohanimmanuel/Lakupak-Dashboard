'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Edit, Loader2, Plus, Search, Store, Trash, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as XLSX from 'xlsx';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { isProspectBuyerType } from '@/lib/salesJobs/prospectBuyerTypes';
import { useUserStore } from '@/store/userStore';

export type ProspectRow = {
  buyerId: string;
  customerNumber: string;
  owner: string;
  storeName: string;
  phone: string;
  address: string;
  region: string;
  buyerType: string;
  notes: string;
  status: string;
};

const ROWS_PER_PAGE = 5;

const PROSPECTS_QUERY = `
  query SalesProspects($userId: Int!) {
    salesProspects(userId: $userId) {
      buyerId customerNumber owner storeName phone address region buyerType notes status
    }
  }
`;

export default function ProspectsBoard() {
  const t = useTranslations('dashboard.sales.prospects');
  const router = useRouter();
  const userId = useUserStore((state) => state.user?.id);
  const [rows, setRows] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setError('');
    const result = await fetchGraphQL<{ salesProspects: ProspectRow[] }>(PROSPECTS_QUERY, { userId });
    setRows(result.salesProspects);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('loadFailed')))
      .finally(() => setLoading(false));
  }, [userId, load, t]);

  const regions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) {
      const region = row.region.trim();
      if (region) seen.add(region);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const buyerTypeLabel = useCallback(
    (buyerType: string) => (isProspectBuyerType(buyerType) ? t(`buyerTypes.${buyerType}`) : ''),
    [t],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (regionFilter !== 'all' && row.region.trim() !== regionFilter) return false;
      if (!query) return true;
      return [row.customerNumber, row.owner, row.storeName, row.phone, row.address, row.region, row.notes, buyerTypeLabel(row.buyerType)].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [rows, search, regionFilter, buyerTypeLabel]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);
  const fromRow = totalRows === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const toRow = Math.min(safePage * ROWS_PER_PAGE, totalRows);

  const exportRows = () => {
    const headers = [t('customerNumber'), t('retailer'), t('outlet'), t('phone'), t('address'), t('region'), t('buyerType'), t('notes')];
    const sheetRows = filteredRows.map((row) => [
      row.customerNumber,
      row.owner,
      row.storeName,
      row.phone,
      row.address,
      row.region,
      buyerTypeLabel(row.buyerType),
      row.notes,
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, t('sheetName'));
    XLSX.writeFile(book, 'prospects.xlsx');
  };

  const filteredIds = filteredRows.map((row) => row.buyerId);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
  const bulkDelete = deleteIds.length > 1;

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const openDelete = (ids: string[]) => {
    setDeleteIds(ids);
    setDeleteError('');
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!userId || deleting || deleteIds.length === 0) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await fetchGraphQL<{ deleteSalesProspects: { deleted: number; skipped: number } }>(
        `mutation DeleteProspects($userId: Int!, $buyerIds: [String!]!) {
          deleteSalesProspects(userId: $userId, buyerIds: $buyerIds) { deleted skipped }
        }`,
        { userId, buyerIds: deleteIds },
      );
      const { deleted, skipped } = result.deleteSalesProspects;
      const removed = new Set(deleteIds);
      setShowDeleteModal(false);
      setDeleteIds([]);
      setSelectedIds((current) => current.filter((id) => !removed.has(id)));
      setNotice(deleted === 0 ? t('deleteNone') : skipped > 0 ? t('deleteSkipped', { count: skipped }) : '');
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const checkboxClass = (selected: boolean) =>
    `flex h-4 w-4 items-center justify-center rounded border-2 transition-all duration-200 ${
      selected ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-white hover:border-green-400'
    }`;

  if (loading) return <SkeletonTablePage statCards={0} rows={8} />;

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-4 flex min-w-0 flex-col gap-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <h2 className="min-w-0 truncate text-2xl font-bold text-black">{t('title')}</h2>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-100 @4xl/main:w-auto"
            onClick={exportRows}
          >
            <Download className="h-4 w-4" /> {t('exportData')}
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#084ba6] @4xl/main:w-auto"
            onClick={() => router.push('/sales/prospects/new')}
          >
            <Plus className="h-4 w-4" /> {t('create')}
          </button>
        </div>
      </div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mx-auto mt-3 w-full min-w-0 rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="mb-4 flex w-full min-w-0 flex-col gap-3">
          <div className="relative w-full">
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-[#e6e6e6] bg-white py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
            />
            <Search className="absolute left-3 top-2 h-5 w-5 text-gray-400" />
          </div>
          <div className="relative w-full @4xl/main:w-auto">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 @4xl/main:w-auto @4xl/main:justify-start"
              onClick={() => setShowRegionDropdown((open) => !open)}
            >
              <span>{regionFilter === 'all' ? t('allRegions') : regionFilter}</span>
              <ChevronDown className="ml-1 h-4 w-4 text-gray-500" />
            </button>
            {showRegionDropdown && (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-lg border border-[#e6e6e6] bg-white shadow @4xl/main:right-auto @4xl/main:w-52">
                  <button
                    type="button"
                    onClick={() => {
                      setRegionFilter('all');
                      setShowRegionDropdown(false);
                      setPage(1);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm first:rounded-t-lg ${regionFilter === 'all' ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    {t('allRegions')}
                  </button>
                  {regions.map((region) => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => {
                        setRegionFilter(region);
                        setShowRegionDropdown(false);
                        setPage(1);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm last:rounded-b-lg ${regionFilter === region ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>

        {notice && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{notice}</div>
        )}

        {selectedIds.length > 0 && (
          <div className="mb-3 rounded-lg border border-[#e6e6e6] border-l-4 border-l-green-500 bg-white p-3 shadow-sm md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span className="text-sm font-semibold text-[#0a61d7]">
                {selectedIds.length} {selectedIds.length === 1 ? t('buyerSelected') : t('buyersSelected')} {t('selected')}
              </span>
              <div className="flex items-center gap-2 md:gap-4">
                <span className="hidden text-xs font-semibold text-gray-600 md:block">{t('bulkActionHint')}</span>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => openDelete(selectedIds)}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash className="h-4 w-4" />
                  {t('remove')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg">
          <table className="min-w-full whitespace-nowrap text-left text-sm text-xs">
            <thead className="whitespace-nowrap bg-gray-100 text-gray-500">
              <tr>
                <th className="w-10 px-4 py-3 font-medium uppercase">
                  <button type="button" onClick={() => setSelectedIds(allFilteredSelected ? [] : filteredIds)} aria-label={t('selectAll')} className={checkboxClass(allFilteredSelected)}>
                    {allFilteredSelected && <Check className="h-3 w-3 text-white" />}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium uppercase">{t('customerNumber')}</th>
                <th className="px-4 py-3 font-medium uppercase">{t('retailer')}</th>
                <th className="px-4 py-3 font-medium uppercase">{t('outlet')}</th>
                <th className="px-4 py-3 font-medium uppercase">{t('phone')}</th>
                <th className="px-4 py-3 font-medium uppercase">{t('region')}</th>
                <th className="px-4 py-3 font-medium uppercase">{t('buyerType')}</th>
                <th className="px-4 py-3 font-medium uppercase">{t('address')}</th>
                <th className="px-4 py-3 text-center font-medium uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Store className="h-12 w-12 text-gray-400" />
                      <p className="text-sm">{t('empty')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => {
                  const selected = selectedIds.includes(row.buyerId);
                  return (
                    <tr
                      key={row.buyerId}
                      className={`cursor-pointer border-b border-[#f0f0f0] transition ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest('button')) return;
                        toggleSelect(row.buyerId);
                      }}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleSelect(row.buyerId);
                          }}
                          aria-label={t('selectRow')}
                          className={checkboxClass(selected)}
                        >
                          {selected && <Check className="h-3 w-3 text-white" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-black">{row.customerNumber}</td>
                      <td className="px-4 py-3">
                        <div className="max-w-[180px] truncate font-medium text-black" title={row.owner}>
                          {row.owner}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[180px] truncate text-black" title={row.storeName}>
                          {row.storeName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-black">{row.phone}</td>
                      <td className="px-4 py-3 text-gray-600">{row.region || t('noRegion')}</td>
                      <td className="px-4 py-3 text-gray-600">{buyerTypeLabel(row.buyerType) || t('noBuyerType')}</td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-gray-600" title={row.address}>
                        {row.address}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/sales/prospects/edit/${encodeURIComponent(row.buyerId)}`);
                            }}
                            className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-gray-100 focus:outline-none"
                            title={t('edit')}
                          >
                            <Edit className="h-4 w-4 text-gray-500" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDelete([row.buyerId]);
                            }}
                            className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-red-100 focus:outline-none"
                            title={t('remove')}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">{t('showing', { from: fromRow, to: toRow, total: totalRows })}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              aria-label={t('previousPage')}
              className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  className={`rounded-lg px-3 py-2 text-sm ${safePage === pageNum ? 'bg-[#0a61d7] text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                >
                  {pageNum}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              aria-label={t('nextPage')}
              className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showDeleteModal && deleteIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-[#e6e6e6] bg-white p-4">
            <h2 className="mb-2 text-lg font-bold text-red-500">{bulkDelete ? t('deleteBulkTitle') : t('deleteTitle')}</h2>
            {deleteError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <span className="text-sm text-red-700">{deleteError}</span>
              </div>
            )}
            <p className="mb-4 text-gray-500">
              {bulkDelete ? t('deleteBulkConfirm', { count: deleteIds.length }) : t('deleteConfirm')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteIds([]);
                }}
                disabled={deleting}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('deleting')}
                  </>
                ) : (
                  t('delete')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
