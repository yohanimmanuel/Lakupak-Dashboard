'use client';

import { useEffect, useRef } from 'react';

/**
 * Connects to the WebSocket server and calls `onProductUpdate` when a product-related
 * broadcast is received. Intended to keep the Products table in sync with stock/price changes.
 *
 * Listens for:
 * - `product_updated` (e.g. sold count / stock changed due to order transitions)
 * - `prices_updated`
 * - `offer_updated`
 */
export function useProductUpdateSocket(
  userId: number | null | undefined,
  onProductUpdate: () => void,
): void {
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const onUpdateRef = useRef(onProductUpdate);
  onUpdateRef.current = onProductUpdate;

  useEffect(() => {
    isMountedRef.current = true;
    if (userId == null) return;

    const maxReconnect = 5;
    const reconnectDelayMs = 3000;
    const authCloseCodes = new Set([1008, 4001, 4003]);
    const resetTokenAfterFailedReconnects =
      Number.parseInt(process.env.NEXT_PUBLIC_WS_TOKEN_RESET_AFTER ?? '2', 10) || 2;

    function buildWsUrl(token: string): string {
      if (typeof window === 'undefined') return '';
      const base = process.env.NEXT_PUBLIC_WS_URL;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.hostname;
      const port = process.env.NEXT_PUBLIC_WS_PORT || '3001';
      const origin = base != null && base !== '' ? base.replace(/\/$/, '') : `${protocol}://${host}:${port}`;
      return `${origin}/api/marketplace/ws?token=${encodeURIComponent(token)}`;
    }

    async function connect(useCachedToken?: boolean): Promise<void> {
      if (!isMountedRef.current || userId == null) return;

      let token = useCachedToken ? tokenRef.current : null;
      if (!token) {
        try {
          const res = await fetch('/api/auth/ws-token', { credentials: 'include' });
          if (!res.ok || !isMountedRef.current) return;
          const data = await res.json();
          token = data?.token ?? null;
          if (token) tokenRef.current = token;
        } catch {
          return;
        }
      }
      if (!token || !isMountedRef.current) return;

      const url = buildWsUrl(token);
      if (!url) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isMountedRef.current) reconnectCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg?.type === 'product_updated' || msg?.type === 'prices_updated' || msg?.type === 'offer_updated') {
            onUpdateRef.current();
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (!isMountedRef.current) return;

        // Auth-related closes should force a fresh ws-token fetch on the next attempt.
        if (authCloseCodes.has(event.code)) {
          tokenRef.current = null;
        }

        if (reconnectCountRef.current < maxReconnect) {
          reconnectCountRef.current += 1;

          // After a few consecutive failures, assume the cached token is stale and refresh it.
          if (reconnectCountRef.current >= resetTokenAfterFailedReconnects) {
            tokenRef.current = null;
          }

          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect(tokenRef.current != null);
          }, reconnectDelayMs);
        }
      };

      ws.onerror = () => {
        // onclose will run and handle reconnect
      };
    }

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      tokenRef.current = null;
      reconnectCountRef.current = 0;
    };
  }, [userId]);
}

