import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';
import { broadcastDashboardNotification } from '@/utils/websocketBroadcast';

function emitDashboardNewNotification(userId: number): void {
  broadcastDashboardNotification(userId).catch(() => { /* best-effort */ });
}

function getAuthUserId(context: { user?: { id: number } } | null | undefined): number {
  const id = context?.user?.id;
  if (id == null) throw new Error('Authentication required');
  return id;
}

export const notificationsTypeDefs = /* GraphQL */ `
  type Notification {
    id: String!
    userId: Int!
    type: String!
    title: String!
    message: String!
    isRead: Boolean!
    metadata: JSONObject
    actionUrl: String
    createdAt: String!
    readAt: String
  }

  type NotificationConnection {
    nodes: [Notification!]!
    pagination: PaginationInfo!
    unreadCount: Int!
  }

  extend type Query {
    notifications(
      page: Int
      limit: Int
      type: String
      isRead: Boolean
    ): NotificationConnection!
    
    unreadNotificationCount: Int!
  }

  extend type Mutation {
    markNotificationAsRead(id: String!): Notification
    markAllNotificationsAsRead: Int!
    deleteNotification(id: String!): Boolean!
    clearAllNotifications: Int!
    
    createNotification(
      type: String!
      title: String!
      message: String!
      metadata: JSONObject
      actionUrl: String
    ): Notification!
  }
`;

// Helper to format notification for response
const formatNotification = (notification: {
  id: string;
  userId: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata: unknown;
  actionUrl: string | null;
  createdAt: Date;
  readAt: Date | null;
}) => ({
  id: notification.id,
  userId: notification.userId,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  isRead: notification.isRead,
  metadata: notification.metadata,
  actionUrl: notification.actionUrl,
  createdAt: notification.createdAt.toISOString(),
  readAt: notification.readAt?.toISOString() || null,
});

export const notificationsResolvers = {
  Query: {
    notifications: async (
      _: unknown,
      args: { page?: number; limit?: number; type?: string; isRead?: boolean },
      context: { user?: { id: number } }
    ) => {
      const userId = getAuthUserId(context);
      const { type, isRead } = args;
      const { page, limit } = sanitizePagination(args.page, args.limit);
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { userId };
      if (type) where.type = type;
      if (typeof isRead === 'boolean') where.isRead = isRead;

      const [notifications, totalCount, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId, isRead: false } }),
      ]);

      return {
        nodes: notifications.map(formatNotification),
        pagination: buildPaginationInfo(page, limit, totalCount),
        unreadCount,
      };
    },

    unreadNotificationCount: async (
      _: unknown,
      _args: unknown,
      context: { user?: { id: number } }
    ) => {
      const userId = getAuthUserId(context);
      return prisma.notification.count({
        where: { userId, isRead: false },
      });
    },
  },

  Mutation: {
    markNotificationAsRead: async (
      _: unknown,
      args: { id: string },
      context: { user?: { id: number } }
    ) => {
      const userId = getAuthUserId(context);
      const notification = await prisma.notification.update({
        where: { id: args.id, userId },
        data: { isRead: true, readAt: new Date() },
      });
      return formatNotification(notification);
    },

    markAllNotificationsAsRead: async (
      _: unknown,
      _args: unknown,
      context: { user?: { id: number } }
    ) => {
      const userId = getAuthUserId(context);
      const result = await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return result.count;
    },

    deleteNotification: async (
      _: unknown,
      args: { id: string },
      context: { user?: { id: number } }
    ) => {
      const userId = getAuthUserId(context);
      await prisma.notification.delete({
        where: { id: args.id, userId },
      });
      return true;
    },

    clearAllNotifications: async (
      _: unknown,
      _args: unknown,
      context: { user?: { id: number } }
    ) => {
      const userId = getAuthUserId(context);
      const result = await prisma.notification.deleteMany({
        where: { userId },
      });
      return result.count;
    },

    createNotification: async (
      _: unknown,
      args: { type: string; title: string; message: string; metadata?: unknown; actionUrl?: string },
      context: { user?: { id: number } }
    ) => {
      const userId = getAuthUserId(context);
      const notification = await prisma.notification.create({
        data: {
          userId,
          type: args.type,
          title: args.title,
          message: args.message,
          metadata: args.metadata as object | undefined,
          actionUrl: args.actionUrl,
        },
      });
      emitDashboardNewNotification(userId);
      return formatNotification(notification);
    },
  },
};

// Notification creation helpers for use in other modules
export const NotificationService = {
  // Create order notification for distributor
  async createOrderNotification(
    userId: number,
    orderId: string,
    orderStatus: string,
    storeName: string,
    totalAmount: number
  ) {
    const notifications: Array<{
      type: string;
      title: string;
      message: string;
      metadata: object;
      actionUrl: string;
    }> = [];

    switch (orderStatus) {
      case 'Pending':
        notifications.push({
          type: 'order',
          title: 'New Order Received',
          message: `New order #${orderId} from ${storeName} worth ${totalAmount.toLocaleString()}. Awaiting confirmation.`,
          metadata: { orderId, orderStatus, storeName, totalAmount },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'Confirmed':
        notifications.push({
          type: 'order',
          title: 'Order Confirmed',
          message: `Order #${orderId} has been confirmed and is now being processed.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'Packed':
        notifications.push({
          type: 'order',
          title: 'Order Packed',
          message: `Order #${orderId} has been packed and is ready for shipping.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'Shipped':
        notifications.push({
          type: 'order',
          title: 'Order Shipped',
          message: `Order #${orderId} has been shipped to ${storeName}.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'Delivered':
        notifications.push({
          type: 'order',
          title: 'Order Delivered',
          message: `Order #${orderId} has been successfully delivered to ${storeName}.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'Received':
        notifications.push({
          type: 'order',
          title: 'Order Received',
          message: `Order #${orderId} from ${storeName} has been marked as received by the buyer.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'Failed':
        notifications.push({
          type: 'order',
          title: 'Delivery Failed',
          message: `Order #${orderId} from ${storeName} could not be delivered.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'Cancelled':
        notifications.push({
          type: 'order',
          title: 'Order Cancelled',
          message: `Order #${orderId} from ${storeName} has been cancelled.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'Returned':
        notifications.push({
          type: 'order',
          title: 'Order Returned',
          message: `Order #${orderId} from ${storeName} has been returned.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
      case 'ReturnRequested':
        notifications.push({
          type: 'order',
          title: 'Return Request Submitted',
          message: `Buyer has submitted a return/refund request for order #${orderId} from ${storeName}.`,
          metadata: { orderId, orderStatus, storeName },
          actionUrl: `/orders/details/${orderId}`,
        });
        break;
    }

    // Create all notifications
    for (const notif of notifications) {
      await prisma.notification.create({
        data: {
          userId,
          ...notif,
        },
      });
    }
    emitDashboardNewNotification(userId);
    return notifications.length;
  },

  // Driver-to-dashboard status notification with explicit wording
  async createDriverStatusNotification(
    userId: number,
    orderId: string,
    fleetCode: string | null,
    orderStatus: 'Shipped' | 'Delivered' | 'Failed',
    failureReason?: string | null
  ) {
    let title = '';
    let message = '';

    if (orderStatus === 'Shipped') {
      title = 'Driver Started Delivery';
      message = `Your driver on fleet ID ${fleetCode ?? '-'} has started delivery for order #${orderId}.`;
    } else if (orderStatus === 'Delivered') {
      title = 'Driver Completed Delivery';
      message = 'Your driver has completed the delivery. Check the order details for POD sent to customers.';
    } else if (orderStatus === 'Failed') {
      title = 'Delivery Failed';
      const reason = (failureReason && failureReason.trim().length > 0) ? failureReason.trim() : 'an unspecified issue';
      message = `Delivery failed due to ${reason}.`;
    }

    await prisma.notification.create({
      data: {
        userId,
        type: 'driver',
        title,
        message,
        metadata: {
          orderId,
          fleetCode,
          orderStatus,
          failureReason: failureReason ?? null,
        },
        actionUrl: `/orders/details/${orderId}`,
      },
    });
    emitDashboardNewNotification(userId);
  },

  // Create inventory notification
  async createInventoryNotification(
    userId: number,
    productId: string,
    productName: string,
    stockQuantity: number,
    lowStockThreshold: number,
    variantName?: string
  ) {
    const variantInfo = variantName ? ` (${variantName})` : '';
    
    if (stockQuantity === 0) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'inventory',
          title: 'Out of Stock Alert',
          message: `${productName}${variantInfo} is now out of stock!`,
          metadata: { productId, productName, stockQuantity, variantName },
          actionUrl: `/products/catalog/${productId}`,
        },
      });
      emitDashboardNewNotification(userId);
    } else if (stockQuantity <= lowStockThreshold) {
      const isCritical = stockQuantity < lowStockThreshold * 0.5;
      await prisma.notification.create({
        data: {
          userId,
          type: 'inventory',
          title: isCritical ? 'Critical Stock Alert' : 'Low Stock Alert',
          message: `${productName}${variantInfo} has only ${stockQuantity} units remaining${isCritical ? ' (critical level)' : ''}.`,
          metadata: { productId, productName, stockQuantity, lowStockThreshold, variantName, isCritical },
          actionUrl: `/products/catalog/${productId}`,
        },
      });
      emitDashboardNewNotification(userId);
    }
  },

  // Helper: Check stock levels and trigger notifications if threshold crossed
  // This prevents duplicate notifications by only alerting when stock crosses a threshold
  async checkAndNotifyStockLevel(
    userId: number,
    productId: string,
    productName: string,
    previousStock: number,
    newStock: number,
    lowStockThreshold: number,
    variantName?: string
  ) {
    // Only notify if stock crossed a threshold (to avoid duplicates)
    const wasOutOfStock = previousStock === 0;
    const wasCritical = previousStock > 0 && lowStockThreshold > 0 && previousStock < lowStockThreshold * 0.5;
    const wasLowStock = previousStock > 0 && lowStockThreshold > 0 && previousStock <= lowStockThreshold;
    const wasInStock = previousStock > lowStockThreshold;

    const isOutOfStock = newStock === 0;
    const isCritical = newStock > 0 && lowStockThreshold > 0 && newStock < lowStockThreshold * 0.5;
    const isLowStock = newStock > 0 && lowStockThreshold > 0 && newStock <= lowStockThreshold;
    const isInStock = newStock > lowStockThreshold;

    // Trigger notification if:
    // 1. Just went out of stock (was > 0, now = 0)
    // 2. Just went critical (was >= threshold*0.5, now < threshold*0.5)
    // 3. Just went low stock (was > threshold, now <= threshold)
    // 4. Just went back to healthy stock (was <= threshold, now > threshold)
    if (isOutOfStock && !wasOutOfStock) {
      await this.createInventoryNotification(userId, productId, productName, newStock, lowStockThreshold, variantName);
    } else if (isCritical && !wasCritical && !wasOutOfStock) {
      await this.createInventoryNotification(userId, productId, productName, newStock, lowStockThreshold, variantName);
    } else if (isLowStock && !wasLowStock && !wasOutOfStock && !wasCritical) {
      await this.createInventoryNotification(userId, productId, productName, newStock, lowStockThreshold, variantName);
    } else if (isInStock && !wasInStock && (wasOutOfStock || wasCritical || wasLowStock)) {
      // Stock restored to healthy level
      const variantInfo = variantName ? ` (${variantName})` : '';
      await prisma.notification.create({
        data: {
          userId,
          type: 'inventory',
          title: 'Stock Restored',
          message: `${productName}${variantInfo} stock has been restored to healthy levels (${newStock} units).`,
          metadata: { productId, productName, stockQuantity: newStock, lowStockThreshold, variantName, restored: true },
          actionUrl: `/products/catalog/${productId}`,
        },
      });
      emitDashboardNewNotification(userId);
    }
  },

  // Create offer activated notification
  async createOfferActivatedNotification(
    userId: number,
    offerId: string,
    offerName: string
  ) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'offer',
        title: 'Offer Activated',
        message: `Your offer "${offerName}" is now active and available to customers.`,
        metadata: { offerId, offerName, status: 'active' },
        actionUrl: `/offers/details?id=${offerId}`,
      },
    });
    emitDashboardNewNotification(userId);
  },

  // Create offer expired notification
  async createOfferExpiredNotification(
    userId: number,
    offerId: string,
    offerName: string
  ) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'offer',
        title: 'Offer Expired',
        message: `Your offer "${offerName}" has expired and is no longer active.`,
        metadata: { offerId, offerName, status: 'expired' },
        actionUrl: `/offers/details?id=${offerId}`,
      },
    });
    emitDashboardNewNotification(userId);
  },

  // Create offer expiration notification (for expiring soon reminders)
  async createOfferExpirationNotification(
    userId: number,
    offerId: string,
    offerName: string,
    daysUntilExpiry: number,
    expiryThreshold?: number
  ) {
    // Delegate to createOfferExpiredNotification for the zero-days case
    if (daysUntilExpiry === 0) {
      return this.createOfferExpiredNotification(userId, offerId, offerName);
    }

    let title = '';
    let message = '';

    if (daysUntilExpiry === 1) {
      title = 'Offer Expiring Tomorrow';
      message = `Your offer "${offerName}" will expire tomorrow.`;
    } else if (daysUntilExpiry <= 3) {
      title = 'Offer Expiring Soon';
      message = `Your offer "${offerName}" will expire in ${daysUntilExpiry} days.`;
    } else if (daysUntilExpiry <= 7) {
      title = 'Offer Expiration Reminder';
      message = `Your offer "${offerName}" will expire in ${daysUntilExpiry} days.`;
    }

    if (title) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'offer',
          title,
          message,
          metadata: { 
            offerId, 
            offerName, 
            daysUntilExpiry,
            expiryThreshold: expiryThreshold || daysUntilExpiry // Track threshold for deduplication
          },
          actionUrl: `/offers/details?id=${offerId}`,
        },
      });
      emitDashboardNewNotification(userId);
    }
  },

  // Create product published notification
  async createProductPublishedNotification(
    userId: number,
    productId: string,
    productName: string
  ) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'product',
        title: 'Product Published',
        message: `Your product "${productName}" has been published to the marketplace.`,
        metadata: { productId, productName, status: 'published' },
        actionUrl: `/products/details?id=${productId}`,
      },
    });
    emitDashboardNewNotification(userId);
  },

  // Create campaign sent notification
  async createCampaignSentNotification(
    userId: number,
    campaignId: string,
    campaignName: string,
    recipients: string
  ) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'campaign',
        title: 'Campaign Sent',
        message: `Your campaign "${campaignName}" has been sent to ${recipients}.`,
        metadata: { campaignId, campaignName, recipients, status: 'sent' },
        actionUrl: `/marketing/campaigns/details?id=${campaignId}`,
      },
    });
    emitDashboardNewNotification(userId);
  },

  // Create new buyer notification
  async createNewBuyerNotification(
    userId: number,
    buyerId: string,
    storeName: string,
    isFirstOrder: boolean = false
  ) {
    if (isFirstOrder) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'buyer',
          title: 'First Order from New Buyer!',
          message: `${storeName} just placed their first order with you!`,
          metadata: { buyerId, storeName, isFirstOrder },
          actionUrl: `/clients/buyers/details/${buyerId}`,
        },
      });
      emitDashboardNewNotification(userId);
    } else {
      await prisma.notification.create({
        data: {
          userId,
          type: 'buyer',
          title: 'New Buyer Registered',
          message: `${storeName} has registered as a new buyer.`,
          metadata: { buyerId, storeName },
          actionUrl: `/clients/buyers/details/${buyerId}`,
        },
      });
      emitDashboardNewNotification(userId);
    }
  },

  // Create campaign sent notification
  async createCampaignNotification(
    userId: number,
    campaignId: string,
    campaignName: string,
    recipientCount: number
  ) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'campaign',
        title: 'Campaign Sent Successfully',
        message: `Your campaign "${campaignName}" has been sent to ${recipientCount} recipients.`,
        metadata: { campaignId, campaignName, recipientCount },
        actionUrl: `/marketing/campaigns/details?id=${campaignId}`,
      },
    });
    emitDashboardNewNotification(userId);
  },

  // Create product published notification
  async createProductNotification(
    userId: number,
    productId: string,
    productName: string,
    action: 'published' | 'unpublished' | 'price_changed'
  ) {
    let title = '';
    let message = '';

    switch (action) {
      case 'published':
        title = 'Product Published';
        message = `${productName} has been published to the marketplace.`;
        break;
      case 'unpublished':
        title = 'Product Unpublished';
        message = `${productName} has been removed from the marketplace.`;
        break;
      case 'price_changed':
        title = 'Price Updated';
        message = `Price has been updated for ${productName}.`;
        break;
    }

    await prisma.notification.create({
      data: {
        userId,
        type: 'product',
        title,
        message,
        metadata: { productId, productName, action },
        actionUrl: `/products/catalog/${productId}`,
      },
    });
    emitDashboardNewNotification(userId);
  },
};
