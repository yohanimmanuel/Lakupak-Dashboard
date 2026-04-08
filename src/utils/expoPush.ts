/**
 * Send push notifications via Expo Push API.
 * - Marketplace buyers  → sendExpoPushToMarketplaceUser (PushNotificationToken table)
 * - Drivers             → sendExpoPushToDriver (DriverPushNotificationToken table)
 * Uses FCM on Android and APNs on iOS under the hood.
 */
import { prisma } from '@/lib/db';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[.+\]$/i.test(token) || /^ExpoPushToken\[.+\]$/i.test(token);
}

/**
 * Send a push notification to all active Expo push tokens for a marketplace user.
 * Best-effort: logs errors but does not throw. Call when order status changes, etc.
 * @returns { tokenCount } so caller can fallback to WebSocket when 0 (e.g. FCM not configured, no token saved).
 */
export async function sendExpoPushToMarketplaceUser(
  marketplaceUserId: number,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ tokenCount: number }> {
  try {
    const rows = await prisma.pushNotificationToken.findMany({
      where: { userId: marketplaceUserId, isActive: true },
      select: { token: true },
    });
    const expoTokens = rows.map((r) => r.token).filter(isExpoPushToken);

    if (expoTokens.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ExpoPush] No tokens for userId', marketplaceUserId, '- use WebSocket fallback if app is in foreground.');
      }
      return { tokenCount: 0 };
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn('[ExpoPush] Sending to', expoTokens.length, 'token(s) for userId', marketplaceUserId);
    }

    const payload = {
      to: expoTokens,
      title,
      body,
      data: data || {},
      sound: 'default' as const,
      channelId: 'orders',
      priority: 'high' as const,
    };

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();

    if (!res.ok) {
      console.error('[ExpoPush] send failed:', res.status, text);
      return { tokenCount: 0 };
    }

    // Expo can return 200 with per-ticket errors (e.g. DeviceNotRegistered, InvalidCredentials)
    try {
      const json = JSON.parse(text) as { data?: Array<{ status?: string; message?: string }> };
      const errors = json?.data?.filter((d) => d?.status === 'error') ?? [];
      if (errors.length > 0 && process.env.NODE_ENV === 'development') {
        console.warn('[ExpoPush] Expo reported delivery errors:', errors.map((e) => e?.message || e));
      }
    } catch {
      // ignore parse errors
    }

    return { tokenCount: expoTokens.length };
  } catch (e) {
    console.error('[ExpoPush] error:', e);
    return { tokenCount: 0 };
  }
}

const EXPO_BATCH_SIZE = 90;

/**
 * Broadcast-style push to every active marketplace Expo token (all users).
 * Used for platform-wide announcements. Chunked for Expo API limits.
 */
export async function sendExpoPushToAllMarketplaceUsers(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ tokenCount: number }> {
  try {
    const rows = await prisma.pushNotificationToken.findMany({
      where: { isActive: true },
      select: { token: true },
    });
    const seen = new Set<string>();
    const expoTokens: string[] = [];
    for (const r of rows) {
      if (!r.token || seen.has(r.token)) continue;
      if (!isExpoPushToken(r.token)) continue;
      seen.add(r.token);
      expoTokens.push(r.token);
    }

    if (expoTokens.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ExpoPush] No marketplace tokens for broadcast');
      }
      return { tokenCount: 0 };
    }

    let sent = 0;
    for (let i = 0; i < expoTokens.length; i += EXPO_BATCH_SIZE) {
      const slice = expoTokens.slice(i, i + EXPO_BATCH_SIZE);
      const messages = slice.map((to) => ({
        to,
        title,
        body,
        data: data ?? {},
        sound: 'default' as const,
        channelId: 'default',
        priority: 'high' as const,
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(15_000),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error('[ExpoPush] broadcast batch failed:', res.status, text);
        continue;
      }
      sent += slice.length;
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn('[ExpoPush] Broadcast sent to ~', sent, 'token(s)');
    }

    return { tokenCount: sent };
  } catch (e) {
    console.error('[ExpoPush] broadcast error:', e);
    return { tokenCount: 0 };
  }
}

/**
 * Send a push notification to all active Expo push tokens for a driver.
 * Best-effort: logs errors but does not throw.
 */
export async function sendExpoPushToDriver(
  driverId: number,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ tokenCount: number }> {
  try {
    const rows = await prisma.driverPushNotificationToken.findMany({
      where: { driverId, isActive: true },
      select: { token: true },
    });
    const expoTokens = rows.map((r) => r.token).filter(isExpoPushToken);

    if (expoTokens.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ExpoPush] No driver tokens for driverId', driverId);
      }
      return { tokenCount: 0 };
    }

    const payload = {
      to: expoTokens,
      title,
      body,
      data: data ?? {},
      sound: 'default' as const,
      channelId: 'driver',
      priority: 'high' as const,
    };

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('[ExpoPush] driver send failed:', res.status, text);
      return { tokenCount: 0 };
    }

    try {
      const json = JSON.parse(text) as { data?: Array<{ status?: string; message?: string }> };
      const errors = json?.data?.filter((d) => d?.status === 'error') ?? [];
      if (errors.length > 0 && process.env.NODE_ENV === 'development') {
        console.warn('[ExpoPush] driver delivery errors:', errors.map((e) => e?.message || e));
      }
    } catch { /* ignore */ }

    return { tokenCount: expoTokens.length };
  } catch (e) {
    console.error('[ExpoPush] driver error:', e);
    return { tokenCount: 0 };
  }
}
