/**
 * Send push notifications to marketplace (mobile) users via Expo Push API.
 * Uses FCM on Android and APNs on iOS under the hood. Tokens are stored
 * in PushNotificationToken (Expo push tokens from the app).
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
