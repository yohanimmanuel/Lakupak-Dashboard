'use client';

import { useEffect, useRef } from 'react';

/**
 * Connects to the WebSocket server for real-time dashboard notifications.
 * When a "dashboard_new" notification is received, onNewNotification is called (e.g. refetch list).
 * Uses /api/auth/ws-token for a JWT; reconnect on close up to 5 times.
 */
export function useDashboardNotificationSocket(
  userId: number | undefined,
  onNewNotification: () => void
): void {
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const onNewRef = useRef(onNewNotification);
  onNewRef.current = onNewNotification;

  useEffect(() => {
    isMountedRef.current = true;
    if (!userId) return;

    const maxReconnect = 5;
    const reconnectDelayMs = 3000;

    function buildWsUrl(token: string): string {
      if (typeof window === 'undefined') return '';
      const base = process.env.NEXT_PUBLIC_WS_URL;
      if (base) {
        return `${base.replace(/\/$/, '')}/api/marketplace/ws?token=${encodeURIComponent(token)}`;
      }
      const isHttps = window.location.protocol === 'https:';
      const protocol = isHttps ? 'wss' : 'ws';
      const host = window.location.hostname;
      const explicitPort = process.env.NEXT_PUBLIC_WS_PORT;
      const portSuffix = isHttps
        ? explicitPort && explicitPort !== '443' && explicitPort !== 'none' ? `:${explicitPort}` : ''
        : `:${explicitPort || '3001'}`;
      const origin = `${protocol}://${host}${portSuffix}`;
      return `${origin}/api/marketplace/ws?token=${encodeURIComponent(token)}`;
    }

    async function connect(useCachedToken?: boolean): Promise<void> {
      if (!isMountedRef.current || !userId) return;

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
          if (msg?.type === 'notification' && msg?.notification?.type === 'dashboard_new') {
            onNewRef.current();
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!isMountedRef.current) return;
        if (reconnectCountRef.current < maxReconnect) {
          reconnectCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect(true);
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
