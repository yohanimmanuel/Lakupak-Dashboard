/**
 * Send push notifications via Expo Push API.
 * - Marketplace buyers  → sendExpoPushToMarketplaceUser (PushNotificationToken table)
 * - Drivers             → sendExpoPushToDriver (DriverPushNotificationToken table)
 * Uses FCM on Android and APNs on iOS under the hood.
 */
import { prisma } from '@/lib/db';
import {
  type DriverPushLanguage,
  type DriverPushPayload,
  normalizeDriverPushLanguage,
} from './driverPushTranslations';
import type { MarketplacePushPayload } from './marketplacePushTranslations';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[.+\]$/i.test(token) || /^ExpoPushToken\[.+\]$/i.test(token);
}

/**
 * Resolve buyer notification copy language for WebSocket/in-app (MarketplaceUser has no locale column).
 * Uses the most recently updated active push token's `language`, same basis as
 * `sendExpoPushToMarketplaceUser` grouping — falls back via {@link normalizeDriverPushLanguage}.
 */
export async function getMarketplaceUserPushLanguage(marketplaceUserId: number): Promise<DriverPushLanguage> {
  const row = await prisma.pushNotificationToken.findFirst({
    where: { userId: marketplaceUserId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { language: true },
  });
  return normalizeDriverPushLanguage(row?.language);
}

/**
 * Send a push notification to all active Expo push tokens for a marketplace user.
 *
 * Two call shapes (mirrors `sendExpoPushToDriver`):
 *   1. Legacy: `title` and `body` strings — same text to every device.
 *   2. Localized: `Record<DriverPushLanguage, MarketplacePushPayload>` — tokens grouped by stored `language`.
 *
 * Best-effort: logs errors but does not throw.
 * @returns { tokenCount } so caller can fallback to WebSocket when 0 (e.g. FCM not configured, no token saved).
 */
export async function sendExpoPushToMarketplaceUser(
  marketplaceUserId: number,
  titleOrTranslations: string | Record<DriverPushLanguage, MarketplacePushPayload>,
  bodyOrData?: string | Record<string, unknown>,
  data?: Record<string, unknown>,
): Promise<{ tokenCount: number }> {
  try {
    const isLocalized = typeof titleOrTranslations !== 'string';
    const dataPayload =
      (isLocalized ? (bodyOrData as Record<string, unknown> | undefined) : data) ?? {};

    const rows = await prisma.pushNotificationToken.findMany({
      where: { userId: marketplaceUserId, isActive: true },
      select: { token: true, language: true },
    });
    const validRows = rows.filter((r) => isExpoPushToken(r.token));

    if (validRows.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ExpoPush] No tokens for userId', marketplaceUserId, '- use WebSocket fallback if app is in foreground.');
      }
      return { tokenCount: 0 };
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn('[ExpoPush] Sending to', validRows.length, 'token(s) for userId', marketplaceUserId);
    }

    type Group = { language: DriverPushLanguage; tokens: string[] };
    const groups: Group[] = [];

    if (isLocalized) {
      const translations = titleOrTranslations as Record<DriverPushLanguage, MarketplacePushPayload>;
      const buckets = new Map<DriverPushLanguage, string[]>();
      for (const r of validRows) {
        const lang = normalizeDriverPushLanguage(r.language);
        if (!translations[lang]) continue;
        const list = buckets.get(lang) ?? [];
        list.push(r.token);
        buckets.set(lang, list);
      }
      for (const [language, tokens] of buckets) {
        if (tokens.length > 0) groups.push({ language, tokens });
      }
    } else {
      groups.push({ language: 'id', tokens: validRows.map((r) => r.token) });
    }

    let totalSent = 0;
    for (const group of groups) {
      const { title, body } = isLocalized
        ? (titleOrTranslations as Record<DriverPushLanguage, MarketplacePushPayload>)[group.language]
        : { title: titleOrTranslations as string, body: (bodyOrData as string) ?? '' };

      const payload = {
        to: group.tokens,
        title,
        body,
        data: dataPayload,
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
        continue;
      }

      try {
        const json = JSON.parse(text) as { data?: Array<{ status?: string; message?: string }> };
        const errors = json?.data?.filter((d) => d?.status === 'error') ?? [];
        if (errors.length > 0 && process.env.NODE_ENV === 'development') {
          console.warn('[ExpoPush] Expo reported delivery errors:', errors.map((e) => e?.message || e));
        }
      } catch {
        // ignore parse errors
      }

      totalSent += group.tokens.length;
    }

    return { tokenCount: totalSent };
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
 *
 * Two ways to call:
 *   1. Legacy/single-language: pass `title` and `body` as strings — every device gets the same text.
 *   2. Localized: pass a `Record<DriverPushLanguage, DriverPushPayload>` map and tokens are
 *      grouped by their stored language so each device receives its translation.
 *
 * Best-effort: logs errors but does not throw.
 */
export async function sendExpoPushToDriver(
  driverId: number,
  titleOrTranslations: string | Record<DriverPushLanguage, DriverPushPayload>,
  bodyOrData?: string | Record<string, unknown>,
  data?: Record<string, unknown>,
): Promise<{ tokenCount: number }> {
  try {
    const isLocalized = typeof titleOrTranslations !== 'string';
    const dataPayload =
      (isLocalized ? (bodyOrData as Record<string, unknown> | undefined) : data) ?? {};

    const rows = await prisma.driverPushNotificationToken.findMany({
      where: { driverId, isActive: true },
      select: { token: true, language: true },
    });
    const validRows = rows.filter((r) => isExpoPushToken(r.token));

    if (validRows.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ExpoPush] No driver tokens for driverId', driverId);
      }
      return { tokenCount: 0 };
    }

    // Group tokens by language so we can send each group its own translated payload.
    // For the legacy (string title/body) call shape we just collapse everyone into one group.
    type Group = { language: DriverPushLanguage; tokens: string[] };
    const groups: Group[] = [];

    if (isLocalized) {
      const translations = titleOrTranslations as Record<DriverPushLanguage, DriverPushPayload>;
      const buckets = new Map<DriverPushLanguage, string[]>();
      for (const r of validRows) {
        const lang = normalizeDriverPushLanguage(r.language);
        if (!translations[lang]) continue; // safety; normalize already falls back
        const list = buckets.get(lang) ?? [];
        list.push(r.token);
        buckets.set(lang, list);
      }
      for (const [language, tokens] of buckets) {
        if (tokens.length > 0) groups.push({ language, tokens });
      }
    } else {
      groups.push({ language: 'id', tokens: validRows.map((r) => r.token) });
    }

    let totalSent = 0;
    for (const group of groups) {
      const { title, body } = isLocalized
        ? (titleOrTranslations as Record<DriverPushLanguage, DriverPushPayload>)[group.language]
        : { title: titleOrTranslations as string, body: (bodyOrData as string) ?? '' };

      const payload = {
        to: group.tokens,
        title,
        body,
        data: dataPayload,
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
        continue;
      }

      try {
        const json = JSON.parse(text) as { data?: Array<{ status?: string; message?: string }> };
        const errors = json?.data?.filter((d) => d?.status === 'error') ?? [];
        if (errors.length > 0 && process.env.NODE_ENV === 'development') {
          console.warn('[ExpoPush] driver delivery errors:', errors.map((e) => e?.message || e));
        }
      } catch {
        // ignore parse errors
      }

      totalSent += group.tokens.length;
    }

    return { tokenCount: totalSent };
  } catch (e) {
    console.error('[ExpoPush] driver error:', e);
    return { tokenCount: 0 };
  }
}
