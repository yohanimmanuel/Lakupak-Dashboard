'use client';

import { useEffect, useRef } from 'react';

function nowIso() {
  return new Date().toISOString();
}

export default function AppSessionTracker() {
  const startedAtRef = useRef<string | null>(null);
  const visibleRef = useRef<boolean>(false);

  useEffect(() => {
    let flushId: number | null = null;
    const beforeUnloadHandler = () => void end('beforeunload');

    const begin = () => {
      if (visibleRef.current) return;
      visibleRef.current = true;
      startedAtRef.current = nowIso();

      if (flushId == null) {
        flushId = window.setInterval(() => {
          if (!visibleRef.current) return;
          const startedAt = startedAtRef.current;
          if (!startedAt) return;
          const endedAt = nowIso();
          const durationSec = Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
          if (!Number.isFinite(durationSec) || durationSec <= 5) return;
          startedAtRef.current = endedAt; // rolling window
          void fetch('/api/telemetry/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ startedAt, endedAt, durationSec }),
          }).catch(() => {});
        }, 60_000);
      }
    };

    const end = async (unloadKind?: 'beforeunload') => {
      if (!visibleRef.current) return;
      visibleRef.current = false;

      const startedAt = startedAtRef.current;
      const endedAt = nowIso();
      startedAtRef.current = null;
      if (!startedAt) return;

      const durationSec = Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
      if (!Number.isFinite(durationSec) || durationSec <= 2) return; // ignore tiny blips

      const body = JSON.stringify({ startedAt, endedAt, durationSec });
      const url = '/api/telemetry/session';

      const useBeacon =
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function' &&
        (unloadKind === 'beforeunload' ||
          (typeof document !== 'undefined' && document.visibilityState === 'hidden'));

      if (useBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }

      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
      } catch {
        // ignore
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') begin();
      else void end();
    };

    // Start immediately if visible
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') begin();

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', beforeUnloadHandler);

    return () => {
      if (flushId != null) window.clearInterval(flushId);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      void end();
    };
  }, []);

  return null;
}

