'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, GripVertical, Loader2, Pencil, Plus, Trash, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';

type SegmentRow = {
  id: number;
  mainChannel: string;
  subChannel: string;
  outletExamples: string;
};

const INPUT =
  'w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]';
const PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#084ba6] disabled:cursor-not-allowed disabled:opacity-50';

const EMPTY = { mainChannel: '', subChannel: '', outletExamples: '' };

function CheckBox({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-all duration-200 focus:outline-none ${
        checked ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-white hover:border-green-400'
      }`}
      aria-label={label}
    >
      {checked ? (
        <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : null}
    </button>
  );
}

export default function MarketSegmentDirectory() {
  const t = useTranslations('dashboard.clients.buyers.marketSegments');
  const userId = useUserStore((state) => state.user?.id);
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editForm, setEditForm] = useState(EMPTY);
  const [editing, setEditing] = useState<SegmentRow | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [requiredTick, setRequiredTick] = useState(0);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const dragIdRef = useRef<number | null>(null);
  const orderRequest = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await fetchGraphQL<{ marketSegmentDirectories: SegmentRow[] }>(
        `query Segments($userId: Int!) {
          marketSegmentDirectories(userId: $userId) {
            id mainChannel subChannel outletExamples
          }
        }`,
        { userId },
      );
      setRows(data.marketSegmentDirectories);
      setSelected((current) => current.filter((id) => data.marketSegmentDirectories.some((row) => row.id === id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!requiredTick || error !== t('mainRequired')) return;
    const timer = window.setTimeout(() => {
      setError((current) => (current === t('mainRequired') ? '' : current));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [error, requiredTick, t]);

  const requireMainChannel = () => {
    setError(t('mainRequired'));
    setRequiredTick((tick) => tick + 1);
  };

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  const toggleAll = () => {
    setSelected(allSelected ? [] : rows.map((row) => row.id));
  };

  const toggleOne = (id: number) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const saveNew = async () => {
    if (!userId || saving) return;
    const mainChannel = form.mainChannel.trim();
    if (!mainChannel) {
      requireMainChannel();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await fetchGraphQL(
        `mutation CreateSegment($userId: Int!, $mainChannel: String!, $subChannel: String, $outletExamples: String) {
          createMarketSegmentDirectory(userId: $userId, mainChannel: $mainChannel, subChannel: $subChannel, outletExamples: $outletExamples) { id }
        }`,
        { userId, mainChannel, subChannel: form.subChannel, outletExamples: form.outletExamples },
      );
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!userId || !editing || saving) return;
    const mainChannel = editForm.mainChannel.trim();
    if (!mainChannel) {
      requireMainChannel();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await fetchGraphQL(
        `mutation UpdateSegment($userId: Int!, $id: Int!, $mainChannel: String!, $subChannel: String, $outletExamples: String) {
          updateMarketSegmentDirectory(userId: $userId, id: $id, mainChannel: $mainChannel, subChannel: $subChannel, outletExamples: $outletExamples) { id }
        }`,
        {
          userId,
          id: editing.id,
          mainChannel,
          subChannel: editForm.subChannel,
          outletExamples: editForm.outletExamples,
        },
      );
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!userId || !pendingDelete?.length || saving) return;
    setSaving(true);
    setError('');
    try {
      if (pendingDelete.length === 1) {
        await fetchGraphQL(
          `mutation DeleteSegment($userId: Int!, $id: Int!) {
            deleteMarketSegmentDirectory(userId: $userId, id: $id) { success pricesRemoved }
          }`,
          { userId, id: pendingDelete[0] },
        );
      } else {
        await fetchGraphQL(
          `mutation DeleteSegments($userId: Int!, $ids: [Int!]!) {
            bulkDeleteMarketSegmentDirectories(userId: $userId, ids: $ids) { success pricesRemoved }
          }`,
          { userId, ids: pendingDelete },
        );
      }
      setSelected((current) => current.filter((id) => !pendingDelete.includes(id)));
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  const persistOrder = async (next: SegmentRow[]) => {
    setRows(next);
    if (!userId) return;
    const ticket = ++orderRequest.current;
    try {
      await fetchGraphQL(
        `mutation ReorderSegments($userId: Int!, $ids: [Int!]!) {
          reorderMarketSegmentDirectories(userId: $userId, ids: $ids) { id }
        }`,
        { userId, ids: next.map((row) => row.id) },
      );
    } catch (err) {
      if (ticket !== orderRequest.current) return;
      setError(err instanceof Error ? err.message : t('reorderFailed'));
      await load();
    }
  };

  const dropOn = (targetId: number) => {
    const sourceId = dragIdRef.current;
    dragIdRef.current = null;
    setDragId(null);
    setDragOverId(null);
    if (sourceId == null || sourceId === targetId) return;
    const from = rows.findIndex((row) => row.id === sourceId);
    const to = rows.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void persistOrder(next);
  };

  const deleteCopy = useMemo(() => {
    if (!pendingDelete?.length) return '';
    if (pendingDelete.length > 1) return t('deleteBulkConfirm', { count: pendingDelete.length });
    const row = rows.find((item) => item.id === pendingDelete[0]);
    if (!row) return t('deleteConfirm');
    const others = rows.some(
      (item) =>
        item.id !== row.id && item.mainChannel.trim().toLowerCase() === row.mainChannel.trim().toLowerCase(),
    );
    return others ? t('deleteConfirm') : t('deleteLastConfirm', { channel: row.mainChannel });
  }, [pendingDelete, rows, t]);

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-4">
        <h1 className="mb-2 text-2xl font-bold text-black">{t('title')}</h1>
        <p className="max-w-3xl text-sm text-gray-600">{t('subtitle')}</p>
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="mb-4 rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">{t('mainChannel')}</span>
            <input
              className={INPUT}
              value={form.mainChannel}
              placeholder={t('mainPlaceholder')}
              onChange={(event) => setForm((current) => ({ ...current, mainChannel: event.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">{t('subChannel')}</span>
            <input
              className={INPUT}
              value={form.subChannel}
              placeholder={t('subPlaceholder')}
              onChange={(event) => setForm((current) => ({ ...current, subChannel: event.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">{t('outletExamples')}</span>
            <input
              className={INPUT}
              value={form.outletExamples}
              placeholder={t('outletPlaceholder')}
              onChange={(event) => setForm((current) => ({ ...current, outletExamples: event.target.value }))}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">{t('optionalHint')}</p>
        <div className="mt-3">
          <button type="button" className={PRIMARY} disabled={saving} onClick={() => void saveNew()}>
            {saving && !editing && !pendingDelete ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t('add')}
          </button>
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="mb-2 rounded-lg border border-[#e6e6e6] border-l-4 border-l-green-500 bg-white p-3 shadow-sm md:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="text-sm font-semibold text-green-700">
                {selected.length === 1 ? t('selectedOne') : t('selectedMany', { count: selected.length })}
              </span>
              <p className="mt-0.5 text-xs font-semibold text-gray-600">{t('deleteSelected')}</p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => setPendingDelete(selected)}
              className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              <Trash className="h-4 w-4" />
              {t('deleteSelected')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="hidden overflow-x-auto rounded-lg md:block">
        <table className="min-w-full whitespace-nowrap text-left text-xs">
          <thead className="bg-gray-100 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium uppercase">
                <CheckBox checked={allSelected} label={t('actions')} onClick={toggleAll} />
              </th>
              <th className="px-4 py-3 font-medium uppercase">{t('mainChannel')}</th>
              <th className="px-4 py-3 font-medium uppercase">{t('subChannel')}</th>
              <th className="px-4 py-3 font-medium uppercase">{t('outletExamples')}</th>
              <th className="px-4 py-3 text-center font-medium uppercase">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-gray-500">
                  {t('loading')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-gray-500">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = selected.includes(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-b transition ${
                      dragId === row.id ? 'opacity-50' : isSelected || dragOverId === row.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => toggleOne(row.id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (dragIdRef.current != null && dragIdRef.current !== row.id) setDragOverId(row.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      dropOn(row.id);
                    }}
                  >
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <CheckBox checked={isSelected} label={row.mainChannel} onClick={() => toggleOne(row.id)} />
                    </td>
                    <td className="px-4 py-3 font-medium text-black">{row.mainChannel}</td>
                    <td className="px-4 py-3 text-black">{row.subChannel || '—'}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-black">{row.outletExamples || '—'}</td>
                    <td className="px-4 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          draggable
                          className="cursor-grab rounded-lg p-2 text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
                          aria-label={t('dragToReorder')}
                          onDragStart={(event) => {
                            dragIdRef.current = row.id;
                            setDragId(row.id);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', String(row.id));
                          }}
                          onDragEnd={() => {
                            dragIdRef.current = null;
                            setDragId(null);
                            setDragOverId(null);
                          }}
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                          aria-label={t('edit')}
                          onClick={() => {
                            setEditing(row);
                            setEditForm({
                              mainChannel: row.mainChannel,
                              subChannel: row.subChannel,
                              outletExamples: row.outletExamples,
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                          aria-label={t('delete')}
                          onClick={() => setPendingDelete([row.id])}
                        >
                          <Trash2 className="h-4 w-4" />
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

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg border border-[#e6e6e6] bg-white p-4">
            <h2 className="mb-4 text-lg font-bold text-black">{t('editTitle')}</h2>
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">{t('mainChannel')}</span>
                <input
                  className={INPUT}
                  value={editForm.mainChannel}
                  onChange={(event) => setEditForm((current) => ({ ...current, mainChannel: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">{t('subChannel')}</span>
                <input
                  className={INPUT}
                  value={editForm.subChannel}
                  onChange={(event) => setEditForm((current) => ({ ...current, subChannel: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">{t('outletExamples')}</span>
                <input
                  className={INPUT}
                  value={editForm.outletExamples}
                  onChange={(event) => setEditForm((current) => ({ ...current, outletExamples: event.target.value }))}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                disabled={saving}
                onClick={() => setEditing(null)}
              >
                {t('cancel')}
              </button>
              <button type="button" className={PRIMARY} disabled={saving} onClick={() => void saveEdit()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-[#e6e6e6] bg-white p-4">
            <h2 className="mb-2 text-lg font-bold text-red-500">{t('delete')}</h2>
            <p className="mb-4 text-gray-500">{deleteCopy}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                disabled={saving}
                onClick={() => setPendingDelete(null)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                disabled={saving}
                onClick={() => void confirmDelete()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
