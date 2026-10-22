'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, UserRound, X } from 'lucide-react';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

type RepOption = { id: string; name: string; phone: string; status: string };

const REPS_QUERY = `
  query SalesRepOptions($userId: Int!) {
    salesJobFormOptions(userId: $userId) {
      agents { id name phone status }
    }
  }
`;

/** Selected rep ids live on the action config as `salesRepIds: string[]`. */
export function normalizeSalesRepIds(config: Record<string, unknown> | undefined): string[] {
  const list = config?.salesRepIds;
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.map((id) => String(id ?? '').trim()).filter(Boolean)));
}

/**
 * Multi-select salesman picker for the Assign sales job action.
 * Empty selection keeps the default: send to the salesman the job belongs to.
 */
export function SalesRepPickerField({
  label,
  selectedIds,
  onChangeAction,
}: {
  label: string;
  selectedIds: string[];
  onChangeAction: (ids: string[]) => void;
}) {
  const { tBuilder } = useAutomationTranslations();
  const user = useUserStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [reps, setReps] = useState<RepOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReps = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGraphQL<{ salesJobFormOptions: { agents: RepOption[] } }>(REPS_QUERY, {
        userId: user.id,
      });
      setReps(data.salesJobFormOptions.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : tBuilder('salesRepPickerLoadFailed'));
      setReps([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tBuilder]);

  useEffect(() => {
    void loadReps();
  }, [loadReps]);

  const nameOf = (id: string) => reps.find((rep) => rep.id === id)?.name || id;
  const toggle = (id: string) => {
    onChangeAction(
      selectedIds.includes(id) ? selectedIds.filter((row) => row !== id) : [...selectedIds, id],
    );
  };

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <div className="overflow-hidden rounded-lg border border-[#e6e6e6] bg-white">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
        >
          <UserRound className="h-4 w-4 shrink-0 text-[#0a61d7]" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-black">
            {selectedIds.length === 0
              ? tBuilder('salesRepPickerEmpty')
              : selectedIds.map(nameOf).join(', ')}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-gray-100 px-3 py-2">
            {selectedIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-[#eef5ff] px-2 py-1 text-[11px] font-medium text-[#0a61d7]"
              >
                {nameOf(id)}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={nameOf(id)}
                  className="rounded-full p-0.5 hover:bg-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {open && (
          <div className="max-h-56 overflow-y-auto border-t border-gray-100">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tBuilder('salesRepPickerLoading')}
              </div>
            ) : error ? (
              <p className="px-3 py-4 text-xs text-red-600">{error}</p>
            ) : reps.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-500">{tBuilder('salesRepPickerNoReps')}</p>
            ) : (
              reps.map((rep) => {
                const checked = selectedIds.includes(rep.id);
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => toggle(rep.id)}
                    aria-pressed={checked}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <span
                      className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border ${
                        checked ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-black">{rep.name}</span>
                      <span className="block truncate text-[11px] text-gray-500">
                        {rep.phone.trim() || tBuilder('salesRepPickerNoPhone')}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-500">{tBuilder('salesRepPickerHint')}</p>
    </div>
  );
}
