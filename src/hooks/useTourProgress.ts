'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  mergeTourBlobs,
  type TourProgressBlob,
  type TourProgressEntry,
  type TourProgressStatus,
} from '@/lib/dashboardTourProgress';

export type { TourProgressBlob, TourProgressEntry, TourProgressStatus };

const LS_PREFIX = 'laku.dashboard.tours.v1';

function lsKey(userId: number) {
  return `${LS_PREFIX}:${userId}`;
}

export function readTourProgress(userId: number): TourProgressBlob {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(lsKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TourProgressBlob;
  } catch {
    return {};
  }
}

export function writeTourProgress(userId: number, blob: TourProgressBlob) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(blob));
  } catch {
    /* quota / private mode */
  }
}

export function useTourProgress(userId: number | undefined) {
  const [blob, setBlob] = useState<TourProgressBlob>({});
  /** True after first local read + server fetch attempt (or skipped when no user). Avoids offering the shell tour from stale empty state before merge. */
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const patchServer = useCallback(async (next: TourProgressBlob) => {
    try {
      await fetch('/api/user/tour-progress', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tours: next }),
      });
    } catch {
      /* best-effort */
    }
  }, []);

  const persistBlob = useCallback(
    (next: TourProgressBlob) => {
      if (userId == null) return;
      writeTourProgress(userId, next);
      setBlob(next);
      void patchServer(next);
    },
    [userId, patchServer],
  );

  /** Hydrate from localStorage + optional server merge. */
  useEffect(() => {
    if (userId == null) {
      setInitialLoadDone(false);
      return;
    }
    setInitialLoadDone(false);
    const local = readTourProgress(userId);
    setBlob(local);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/tour-progress', { method: 'GET', credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as { tours?: unknown };
        if (cancelled) return;
        const merged = mergeTourBlobs(local, data.tours);
        if (JSON.stringify(merged) !== JSON.stringify(local)) {
          writeTourProgress(userId, merged);
          setBlob(merged);
        }
      } catch {
        /* offline or unauthenticated — local only */
      } finally {
        if (!cancelled) setInitialLoadDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setTourStatus = useCallback(
    (tourId: string, version: number, status: TourProgressEntry['status']) => {
      if (userId == null) return;
      const base = blob ?? {};
      const next: TourProgressBlob = {
        ...base,
        [tourId]: { v: version, status },
      };
      persistBlob(next);
    },
    [userId, blob, persistBlob],
  );

  const resetTour = useCallback(
    (tourId: string) => {
      if (userId == null) return;
      const next = { ...blob };
      delete next[tourId];
      persistBlob(next);
    },
    [userId, persistBlob, blob],
  );

  const getStatus = useCallback(
    (tourId: string, version: number): TourProgressStatus => {
      const e = blob[tourId];
      if (!e || e.v !== version) return 'none';
      return e.status;
    },
    [blob],
  );

  return useMemo(
    () => ({
      blob,
      setTourStatus,
      resetTour,
      getStatus,
      initialLoadDone,
    }),
    [blob, getStatus, resetTour, setTourStatus, initialLoadDone],
  );
}
