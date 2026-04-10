'use client';

import { useEffect, useRef } from 'react';

/**
 * WebSocket for platform admin inbox (aligned with distributor Navbar real-time notifications).
 * On `platform_admin_inbox`, calls onRefresh (e.g. refetch buyer reports bell).
 */
export function usePlatformAdminInboxSocket(onRefresh: () => void): void {
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    isMountedRef.current = true;

    const maxReconnect = 5;
    const reconnectDelayMs = 3000;

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
      if (!isMountedRef.current) return;

      let token = useCachedToken ? tokenRef.current : null;
      if (!token) {
        try {
          const res = await fetch('/api/platform-admin/ws-token', { credentials: 'include' });
          if (!res.ok || !isMountedRef.current) return;
          const data = (await res.json()) as { token?: string };
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
          if (
            msg?.type === 'notification' &&
            msg?.notification?.type === 'platform_admin_inbox'
          ) {
            onRefreshRef.current();
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!isMountedRef.current) return;
        if (reconnectCountRef.current < maxReconnect) {
          reconnectCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            void connect(true);
          }, reconnectDelayMs);
        }
      };

      ws.onerror = () => {
        /* onclose handles reconnect */
      };
    }

    void connect();

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
  }, []);
}
