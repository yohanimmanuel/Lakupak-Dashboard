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
 */
export async function sendExpoPushToMarketplaceUser(
  marketplaceUserId: number,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const rows = await prisma.pushNotificationToken.findMany({
      where: { userId: marketplaceUserId, isActive: true },
      select: { token: true },
    });
    const expoTokens = rows.map((r) => r.token).filter(isExpoPushToken);
    if (expoTokens.length === 0) return;

    const payload = {
      to: expoTokens,
      title,
      body,
      data: data || {},
      sound: 'default' as const,
      channelId: 'orders',
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

    if (!res.ok) {
      const text = await res.text();
      console.error('[ExpoPush] send failed:', res.status, text);
    }
  } catch (e) {
    console.error('[ExpoPush] error:', e);
  }
}
