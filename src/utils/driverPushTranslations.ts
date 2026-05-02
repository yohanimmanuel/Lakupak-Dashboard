/**
 * Server-side translations for driver OS push notifications.
 *
 * The driver app stores its preferred language alongside its push token; when we
 * send a push we look up that language and use the corresponding strings here.
 * Keep these in sync with Laku-Driver/i18n/locales/{id,en}.json — these mirror
 * the keys the in-app notification list uses for foreground events.
 */

export type DriverPushLanguage = 'id' | 'en';

const FALLBACK_LANGUAGE: DriverPushLanguage = 'id';

export function normalizeDriverPushLanguage(value: string | null | undefined): DriverPushLanguage {
  if (value === 'id' || value === 'en') return value;
  return FALLBACK_LANGUAGE;
}

export type DriverPushPayload = { title: string; body: string };

export type DriverPushTranslator =
  | DriverPushPayload
  | ((language: DriverPushLanguage) => DriverPushPayload);

/**
 * Translation strings keyed by language. Two-tier shape so tests / future events
 * stay readable; each entry returns both the title and body for the event.
 */
type DriverPushI18n = {
  orderUpdated: {
    title: Record<string, Record<DriverPushLanguage, string>>;
    body: Record<string, (params: { orderId: string; fleetCode?: string }) => Record<DriverPushLanguage, string>>;
  };
  fleetAssigned: (params: { fleetCode: string; route?: string }) => Record<DriverPushLanguage, DriverPushPayload>;
  ordersAdded: (params: { fleetCode: string; count: number }) => Record<DriverPushLanguage, DriverPushPayload>;
};

const I18N: DriverPushI18n = {
  orderUpdated: {
    title: {
      Packed: { id: '📦 Pengiriman Baru Siap', en: '📦 New Delivery Ready' },
      Shipped: { id: '🚛 Pengiriman Sedang Berlangsung', en: '🚛 Delivery In Progress' },
      Delivered: { id: '✅ Pengiriman Dikonfirmasi', en: '✅ Delivery Confirmed' },
      Cancelled: { id: '❌ Pesanan Dibatalkan', en: '❌ Order Cancelled' },
      Failed: { id: '⚠️ Pengiriman Gagal', en: '⚠️ Delivery Failed' },
      default: { id: 'Pembaruan Pesanan', en: 'Order Update' },
    },
    body: {
      Packed: ({ orderId, fleetCode }) => ({
        id: `Pesanan #${orderId}${fleetCode ? ` · Armada ${fleetCode}` : ''} sudah dikemas dan siap diambil.`,
        en: `Order #${orderId}${fleetCode ? ` · Fleet ${fleetCode}` : ''} is packed and ready for pickup.`,
      }),
      Shipped: ({ orderId }) => ({
        id: `Pesanan #${orderId} telah ditandai sebagai dikirim.`,
        en: `Order #${orderId} has been marked as shipped.`,
      }),
      Delivered: ({ orderId }) => ({
        id: `Pesanan #${orderId} telah dikonfirmasi terkirim.`,
        en: `Order #${orderId} has been confirmed as delivered.`,
      }),
      Cancelled: ({ orderId }) => ({
        id: `Pesanan #${orderId} di armada Anda telah dibatalkan.`,
        en: `Order #${orderId} in your fleet has been cancelled.`,
      }),
      Failed: ({ orderId }) => ({
        id: `Pengiriman pesanan #${orderId} ditandai gagal.`,
        en: `Order #${orderId} delivery has been marked as failed.`,
      }),
    },
  },

  fleetAssigned: ({ fleetCode, route }) => ({
    id: {
      title: '🚛 Armada Baru Ditugaskan',
      body: `Armada ${fleetCode}${route ? ` · ${route}` : ''} telah ditugaskan untuk Anda.`,
    },
    en: {
      title: '🚛 New Fleet Assigned',
      body: `Fleet ${fleetCode}${route ? ` · ${route}` : ''} has been assigned to you.`,
    },
  }),

  ordersAdded: ({ fleetCode, count }) => ({
    id: {
      title: '📦 Armada Diperbarui',
      body: `${count} pesanan ditambahkan ke armada ${fleetCode}.`,
    },
    en: {
      title: '📦 Fleet Updated',
      body: `${count} order${count > 1 ? 's' : ''} added to fleet ${fleetCode}.`,
    },
  }),
};

/** Build per-language payloads for an order status update. */
export function translateDriverOrderUpdate(params: {
  orderId: string;
  status: string;
  fleetCode?: string;
}): Record<DriverPushLanguage, DriverPushPayload> {
  const { orderId, status, fleetCode } = params;
  const titleSet = I18N.orderUpdated.title[status] ?? I18N.orderUpdated.title.default;
  const bodyBuilder = I18N.orderUpdated.body[status];
  const bodySet = bodyBuilder
    ? bodyBuilder({ orderId, fleetCode })
    : {
        // Generic localized fallback for statuses without a dedicated body template
        // (e.g. Confirmed / Received / Returned). Avoids leaking the raw English
        // status word into the middle of an Indonesian sentence — the matching
        // `titleSet` already falls back to "Pembaruan Pesanan" / "Order Update".
        id: `Pesanan #${orderId} telah diperbarui.`,
        en: `Order #${orderId} has been updated.`,
      };
  return {
    id: { title: titleSet.id, body: bodySet.id },
    en: { title: titleSet.en, body: bodySet.en },
  };
}

/** Build per-language payloads for a "new fleet assigned" event. */
export function translateDriverFleetAssigned(params: {
  fleetCode: string;
  route?: string;
}): Record<DriverPushLanguage, DriverPushPayload> {
  return I18N.fleetAssigned(params);
}

/** Build per-language payloads for an "orders added to fleet" event. */
export function translateDriverOrdersAdded(params: {
  fleetCode: string;
  count: number;
}): Record<DriverPushLanguage, DriverPushPayload> {
  return I18N.ordersAdded(params);
}
