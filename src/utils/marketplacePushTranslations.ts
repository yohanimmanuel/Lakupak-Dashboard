/**
 * Server-side translations for marketplace buyer OS push notifications.
 * Keep id/en strings aligned with Laku-Marketplace `orderUpdates.status` / payment copy where applicable.
 */
import { type DriverPushLanguage } from './driverPushTranslations';

export type MarketplacePushPayload = { title: string; body: string };

/** Order status change — same cases as `updateOrder` notify marketplace user. */
export function translateMarketplaceBuyerOrderStatus(params: {
  orderId: string;
  status: string;
}): Record<DriverPushLanguage, MarketplacePushPayload> {
  const { orderId, status } = params;
  switch (status) {
    case 'Confirmed':
      return {
        id: {
          title: 'Pesanan Dikonfirmasi',
          body: `Kabar baik! Pesanan #${orderId} telah dikonfirmasi dan sedang diproses.`,
        },
        en: {
          title: 'Order Confirmed',
          body: `Great news! Your order #${orderId} has been confirmed and is being processed.`,
        },
      };
    case 'Packed':
      return {
        id: {
          title: 'Pesanan Dikemas',
          body: `Pesanan #${orderId} telah dikemas dan siap dikirim.`,
        },
        en: {
          title: 'Order Packed',
          body: `Your order #${orderId} has been packed and is ready for shipping.`,
        },
      };
    case 'Shipped':
      return {
        id: {
          title: 'Pesanan Dikirim',
          body: `Pesanan #${orderId} sedang dalam perjalanan! Lacak pengiriman untuk info terbaru.`,
        },
        en: {
          title: 'Order Shipped',
          body: `Your order #${orderId} is on its way! Track your delivery for updates.`,
        },
      };
    case 'Delivered':
      return {
        id: {
          title: 'Pesanan Terkirim',
          body: `Pesanan #${orderId} telah terkirim. Selamat berbelanja!`,
        },
        en: {
          title: 'Order Delivered',
          body: `Your order #${orderId} has been delivered. Enjoy your purchase!`,
        },
      };
    case 'Received':
      return {
        id: {
          title: 'Pesanan Diterima',
          body: `Pesanan #${orderId} telah ditandai diterima. Terima kasih telah mengkonfirmasi!`,
        },
        en: {
          title: 'Order Received',
          body: `Your order #${orderId} has been marked as received. Thank you for confirming!`,
        },
      };
    case 'Cancelled':
      return {
        id: {
          title: 'Pesanan Dibatalkan',
          body: `Pesanan #${orderId} telah dibatalkan.`,
        },
        en: {
          title: 'Order Cancelled',
          body: `Your order #${orderId} has been cancelled.`,
        },
      };
    case 'Returned':
      return {
        id: {
          title: 'Pesanan Dikembalikan',
          body: `Pengembalian pesanan #${orderId} telah diproses.`,
        },
        en: {
          title: 'Order Returned',
          body: `Your order #${orderId} return has been processed.`,
        },
      };
    case 'Failed':
      return {
        id: {
          title: 'Pengiriman Gagal',
          body: `Maaf, pengiriman pesanan #${orderId} tidak dapat diselesaikan. Hubungi dukungan.`,
        },
        en: {
          title: 'Delivery Failed',
          body: `We're sorry. Delivery of your order #${orderId} could not be completed. Please contact support.`,
        },
      };
    default:
      return {
        id: {
          title: 'Pembaruan Pesanan',
          body: `Pesanan #${orderId} telah diperbarui.`,
        },
        en: {
          title: 'Order Update',
          body: `Your order #${orderId} status has been updated.`,
        },
      };
  }
}

export function translateMarketplaceBuyerOrderCancelled(params: { orderId: string }): Record<
  DriverPushLanguage,
  MarketplacePushPayload
> {
  const { orderId } = params;
  return {
    id: {
      title: 'Pesanan Dibatalkan',
      body: `Pesanan #${orderId} telah dibatalkan.`,
    },
    en: {
      title: 'Order Cancelled',
      body: `Your order #${orderId} has been cancelled.`,
    },
  };
}

export function translateMarketplacePaymentConfirmed(params: { orderId: string }): Record<
  DriverPushLanguage,
  MarketplacePushPayload
> {
  const { orderId } = params;
  return {
    id: {
      title: 'Pembayaran Dikonfirmasi',
      body: `Pembayaran Anda untuk pesanan #${orderId} telah dikonfirmasi.`,
    },
    en: {
      title: 'Payment Confirmed',
      body: `Your payment has been confirmed for order #${orderId}.`,
    },
  };
}

export function translateMarketplacePaymentUnpaid(params: { orderId: string }): Record<
  DriverPushLanguage,
  MarketplacePushPayload
> {
  const { orderId } = params;
  return {
    id: {
      title: 'Status Pembayaran Diperbarui',
      body: `Status pembayaran untuk pesanan #${orderId} sekarang Belum Dibayar.`,
    },
    en: {
      title: 'Payment Status Updated',
      body: `Payment status for order #${orderId} is now Unpaid.`,
    },
  };
}

export function translateMarketplaceReturnRequestSubmitted(params: { orderId: string }): Record<
  DriverPushLanguage,
  MarketplacePushPayload
> {
  const { orderId } = params;
  return {
    id: {
      title: 'Permintaan Pengembalian Terkirim',
      body: `Permintaan pengembalian untuk pesanan #${orderId} telah dikirim. Kami akan memprosesnya dan menghubungi Anda jika diperlukan.`,
    },
    en: {
      title: 'Return Request Submitted',
      body: `Your return request for order #${orderId} has been submitted. We will process it and contact you if needed.`,
    },
  };
}

export function translateMarketplaceReturnRequestRejected(params: { orderId: string }): Record<
  DriverPushLanguage,
  MarketplacePushPayload
> {
  const { orderId } = params;
  return {
    id: {
      title: 'Permintaan Pengembalian Ditolak',
      body: `Permintaan pengembalian untuk pesanan #${orderId} ditolak oleh distributor.`,
    },
    en: {
      title: 'Return Request Declined',
      body: `Your return request for order #${orderId} was declined by the distributor.`,
    },
  };
}

export function translateMarketplacePaymentIntentSubmitted(params: { orderId: string }): Record<
  DriverPushLanguage,
  MarketplacePushPayload
> {
  const { orderId } = params;
  return {
    id: {
      title: 'Niat Pembayaran Terkirim',
      body: `Kami telah memberi tahu distributor untuk pesanan #${orderId}. Silakan selesaikan transfer manual Anda.`,
    },
    en: {
      title: 'Payment Intent Submitted',
      body: `We notified the distributor for order #${orderId}. Please complete your manual transfer.`,
    },
  };
}

/** Push copy when a driver app updates order status (wording differs slightly from catalog `translateMarketplaceBuyerOrderStatus`). */
export function translateMarketplaceBuyerOrderFromDriverApp(params: {
  orderId: string;
  orderStatus: string;
}): Record<DriverPushLanguage, MarketplacePushPayload> {
  const { orderId, orderStatus } = params;
  switch (orderStatus) {
    case 'Shipped':
      return {
        id: {
          title: 'Pesanan Dikirim',
          body: `Pesanan #${orderId} telah dikirim oleh distributor Anda.`,
        },
        en: {
          title: 'Order Shipped',
          body: `Your order #${orderId} has been shipped by your distributor.`,
        },
      };
    case 'Delivered':
      return {
        id: {
          title: 'Pesanan Terkirim',
          body: `Pesanan #${orderId} telah diantar oleh pengemudi Anda.`,
        },
        en: {
          title: 'Order Delivered',
          body: `Your order #${orderId} has been delivered by your driver.`,
        },
      };
    case 'Failed':
      return {
        id: {
          title: 'Pengiriman Gagal',
          body: `Pengiriman untuk pesanan #${orderId} tidak dapat diselesaikan.`,
        },
        en: {
          title: 'Delivery Failed',
          body: `Delivery for order #${orderId} could not be completed.`,
        },
      };
    default:
      return {
        id: {
          title: 'Pembaruan Pesanan',
          body: `Pesanan #${orderId} telah diperbarui.`,
        },
        en: {
          title: 'Order Updated',
          body: `Your order #${orderId} has been updated.`,
        },
      };
  }
}
