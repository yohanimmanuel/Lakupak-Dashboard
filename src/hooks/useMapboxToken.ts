'use client';

import { useState, useEffect } from 'react';

export function useMapboxToken(): {
  token: string | null;
  isLoading: boolean;
  error: Error | null;
} {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/mapbox-token', { credentials: 'same-origin' })
      .then((res) => res.json().then((data) => ({ status: res.status, ok: res.ok, data })))
      .then(({ status, ok, data }) => {
        if (cancelled) return;
        if (status === 401) {
          setToken(null);
          return;
        }
        if (ok && data?.token) {
          setToken(data.token);
        } else if (ok) {
          setToken(null);
        } else {
          setError(new Error(data?.error || `Failed to fetch token: ${status}`));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { token, isLoading, error };
}
