import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';
import { getOrderSecurityHeaders, validateOrderUpdate, sanitizeOrderData } from '@/utils/order-security';
import { ensureAllPriceConsistency } from '@/utils/orderUtils';
import { parsePrice } from '@/utils/currencyUtils';
import { syncOrderToBuyerProfile, parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { broadcastOrderUpdate, broadcastNotification } from '@/utils/websocketBroadcast';
import {
  getMarketplaceUserPushLanguage,
  sendExpoPushToMarketplaceUser,
  sendExpoPushToDriver,
} from '@/utils/expoPush';
import { translateDriverOrderUpdate } from '@/utils/driverPushTranslations';
import {
  translateMarketplaceBuyerOrderCancelled,
  translateMarketplaceBuyerOrderStatus,
  translateMarketplacePaymentConfirmed,
  translateMarketplacePaymentUnpaid,
  translateMarketplaceReturnRequestRejected,
} from '@/utils/marketplacePushTranslations';
import { orderUpdateRateLimiter } from '@/utils/rateLimiter';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import { decimalToNumber, broadcastSoldCountUpdates, calculateTotalQuantityWithPromotions } from './utils';
import { getUnitPriceFromVariantOption, selectVariantOption } from '@/domain/marketplace/orderItemRules';

// Move-only extraction of PUT handler from `ordersRouteService.ts`.
export async function updateOrderHandler(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();
    
    // Apply rate limiting for order updates: per-user when possible, otherwise per-IP.
    const userIdForRateLimit =
      body.userId && !isNaN(Number(body.userId)) ? Number(body.userId) : null;
    const rateLimitResponse = await orderUpdateRateLimiter(request, userIdForRateLimit);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    // Bulk archive support
    if (Array.isArray(body.archiveOrderIds) && body.archiveOrderIds.length > 0) {
      const baseWhere: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) baseWhere.userId = Number(body.userId);
      const updated = await prisma.order.updateMany({
        where: { ...baseWhere, orderId: { in: body.archiveOrderIds.map((v: unknown) => String(v)) } },
        data: { archivedAt: new Date() }
      });
      try {
        await broadcastOrderUpdate(body.archiveOrderIds.map((v: unknown) => String(v)));
      } catch (error) {
        // Ignore broadcast errors
      }
      return NextResponse.json({ success: true, count: updated.count }, { headers });
    }

    if (body.archive === true && (body.orderId || body.id)) {
      const where: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) where.userId = Number(body.userId);
      if (body.orderId) where.orderId = String(body.orderId);
      else if (body.id) where.id = Number(body.id);

      const archiveBroadcastIds: string[] = [];
      if (body.orderId) {
        archiveBroadcastIds.push(String(body.orderId));
      } else if (body.id) {
        const existing = await prisma.order.findUnique({
          where: { id: Number(body.id) },
          select: { orderId: true }
        });
        if (existing?.orderId) {
          archiveBroadcastIds.push(existing.orderId);
        }
      }

      const result = await prisma.order.updateMany({
        where,
        data: { archivedAt: new Date() }
      });
      if (result.count === 0) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }
      if (archiveBroadcastIds.length > 0) {
        try {
          await broadcastOrderUpdate(archiveBroadcastIds);
        } catch (error) {
          // Ignore broadcast errors
        }
      }
      return NextResponse.json({ success: true }, { headers });
    }

    if ((body.unarchive === true || body.archive === false) && (body.orderId || body.id)) {
      const where: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) where.userId = Number(body.userId);
      if (body.orderId) where.orderId = String(body.orderId);
      else if (body.id) where.id = Number(body.id);

      const unarchiveBroadcastIds: string[] = [];
      if (body.orderId) {
        unarchiveBroadcastIds.push(String(body.orderId));
      } else if (body.id) {
        const existing = await prisma.order.findUnique({
          where: { id: Number(body.id) },
          select: { orderId: true }
        });
        if (existing?.orderId) {
          unarchiveBroadcastIds.push(existing.orderId);
        }
      }

      const result = await prisma.order.updateMany({
        where,
        data: { archivedAt: null }
      });
      if (result.count === 0) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }
      if (unarchiveBroadcastIds.length > 0) {
        try {
          await broadcastOrderUpdate(unarchiveBroadcastIds);
        } catch (error) {
          // Ignore broadcast errors
        }
      }
      return NextResponse.json({ success: true }, { headers });
    }

    // Accept / Reject return request from dashboard
    if (body.returnRequestId && body.returnRequestStatus) {
      const localHeaders = getOrderSecurityHeaders();
      const id = Number(body.returnRequestId);
      const status = String(body.returnRequestStatus);
      if (!Number.isInteger(id) || id < 1) {
        return NextResponse.json({ error: 'Invalid returnRequestId' }, { status: 400, headers: localHeaders });
      }
      if (!['Accepted', 'Rejected'].includes(status)) {
        return NextResponse.json({ error: 'Invalid returnRequestStatus' }, { status: 400, headers: localHeaders });
      }

      try {
        // Verify ownership: the caller must own the order linked to this return request
        const existingReturnRequest = await prisma.orderReturnRequest.findUnique({
          where: { id },
          include: { order: true },
        });

        if (!existingReturnRequest) {
          return NextResponse.json({ error: 'Return request not found' }, { status: 404, headers: localHeaders });
        }

        if (
          body.userId &&
          existingReturnRequest.order.userId &&
          existingReturnRequest.order.userId !== Number(body.userId)
        ) {
          return NextResponse.json({ error: 'Forbidden: you do not own this order' }, { status: 403, headers: localHeaders });
        }

        const rr = await prisma.orderReturnRequest.update({
          where: { id },
          data: { status },
        });

        // Delegate order state change to the unified orderStatus flow below
        body.orderId = rr.orderId;
        body.returnStatus = status;
        if (status === 'Accepted') {
          body.orderStatus = 'Returned';
          body.returnedAt = new Date().toISOString();
          body.returnReason = rr.reason ?? null;
          body.returnReasonDetail = rr.reasonDetail ?? null;
        }

        // Rejection does not change Order.orderStatus, so the buyer push block below never runs.
        // Notify the marketplace buyer explicitly (Expo + WebSocket), same pattern as POST /return-request.
        if (status === 'Rejected') {
          try {
            const marketplaceUserId = existingReturnRequest.marketplaceUserId;
            if (marketplaceUserId != null) {
              const orderRow = existingReturnRequest.order;
              const rejectTranslations = translateMarketplaceReturnRequestRejected({
                orderId: orderRow.orderId,
              });
              const payload = {
                orderId: orderRow.orderId,
                orderStatus: orderRow.orderStatus,
                type: 'order' as const,
                returnRequestStatus: 'Rejected' as const,
              };
              const { tokenCount } = await sendExpoPushToMarketplaceUser(marketplaceUserId, rejectTranslations, payload);
              if (tokenCount === 0) {
                const wsLang = await getMarketplaceUserPushLanguage(marketplaceUserId);
                const wsCopy = rejectTranslations[wsLang] ?? rejectTranslations.en;
                await broadcastNotification('order', wsCopy.title, wsCopy.body, payload, marketplaceUserId);
              }
            }
          } catch {
            // best-effort
          }
        }
      } catch (e) {
        return NextResponse.json({ error: 'Failed to update return request status' }, { status: 500, headers: localHeaders });
      }
    }

    // Cancel order functionality
    if (body.cancel === true && (body.orderId || body.id)) {
      // Find the order first
      let whereClause: { orderId: string } | { id: number };
      if (body.orderId) {
        whereClause = { orderId: String(body.orderId).trim() };
      } else if (body.id) {
        whereClause = { id: Number(body.id) };
      } else {
        return NextResponse.json({ error: 'No orderId or id provided' }, { status: 400, headers });
      }

      // Check if order exists and is cancellable
      const existingOrder = await prisma.order.findFirst({
        where: whereClause
      });

      if (!existingOrder) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }

      // Check if order can be cancelled (only Pending or Confirmed orders)
      const cancellableStatuses = ['Pending', 'Confirmed'];
      if (!cancellableStatuses.includes(existingOrder.orderStatus)) {
        return NextResponse.json({ 
          error: `Order cannot be cancelled. Current status: ${existingOrder.orderStatus}` 
        }, { status: 400, headers });
      }

      const cancelledAt = new Date();
      const cancellationReasonText = body.reason || body.cancellationReason || 'User requested cancellation';
      const updateData = {
        orderStatus: 'Cancelled',
        cancelledAt,
        cancelledBy: body.cancelledBy || body.userId?.toString() || 'User',
        cancellationReason: cancellationReasonText
      };

      const validCancellationReasonCodes = [
        'changed_mind', 'found_cheaper', 'wrong_item', 'delivery_issues',
        'payment_issues', 'seller_issues', 'other'
      ];
      const reasonCode = typeof body.reasonCode === 'string' && validCancellationReasonCodes.includes(body.reasonCode)
        ? body.reasonCode
        : 'other';
      const reasonDetail = typeof body.reasonDetail === 'string' && body.reasonDetail.trim()
        ? body.reasonDetail.trim()
        : null;

      try {
        const updatedOrder = await prisma.order.update({
          where: whereClause,
          data: updateData
        });

        // Persist structured cancel data (marketplace buyer id from order's buyerId)
        const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(updatedOrder.buyerId);
        if (marketplaceUserId != null && Number.isInteger(marketplaceUserId) && marketplaceUserId > 0) {
          try {
            await prisma.orderCancellation.create({
              data: {
                orderId: updatedOrder.orderId,
                marketplaceUserId,
                reason: reasonCode,
                reasonDetail,
                cancelledAt
              }
            });
          } catch (createErr) {
            // Don't fail the cancel if cancellation record fails (e.g. schema not migrated yet)
          }
        }
        
        // Auto-sync order to buyer profile after cancellation
        if (updatedOrder.buyerId && body.userId) {
          try {
            await syncOrderToBuyerProfile(updatedOrder.buyerId, Number(body.userId));
          } catch (syncError) {
          }
        }

        try {
          await broadcastOrderUpdate([updatedOrder.orderId]);
        } catch (error) {
          // Ignore broadcast errors
        }
        try {
          await broadcastSoldCountUpdates(updatedOrder.orderId);
        } catch {
          // Best-effort broadcast
        }

        // Create notification for order cancellation (for distributor dashboard)
        if (updatedOrder.userId) {
          try {
            await NotificationService.createOrderNotification(
              updatedOrder.userId,
              updatedOrder.orderId,
              'Cancelled',
              updatedOrder.storeName || 'Unknown Store',
              decimalToNumber(updatedOrder.totalAmount)
            );
          } catch (notifError) {
            // Don't fail the cancellation if notification creation fails
          }
        }

        // Notify marketplace buyer: Expo Push first; if no Expo tokens, fallback to WebSocket (foreground only)
        try {
          const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(updatedOrder.buyerId);
          if (marketplaceUserId != null) {
            const cancelTranslations = translateMarketplaceBuyerOrderCancelled({
              orderId: updatedOrder.orderId,
            });
            const { tokenCount } = await sendExpoPushToMarketplaceUser(
              marketplaceUserId,
              cancelTranslations,
              { orderId: updatedOrder.orderId, orderStatus: 'Cancelled', type: 'order' },
            );
            if (tokenCount === 0) {
              await broadcastNotification(
                'order',
                cancelTranslations.en.title,
                cancelTranslations.en.body,
                { orderId: updatedOrder.orderId, orderStatus: 'Cancelled', type: 'order' },
                marketplaceUserId
              );
            }
          } else if (process.env.NODE_ENV === 'development') {
            console.warn('[Orders] Cancel: buyerId not parseable for Expo/WebSocket, buyerId=', String(updatedOrder.buyerId ?? ''));
          }
        } catch (notifError) {
          // Don't fail the cancellation if notification fails
        }

        return NextResponse.json({ 
          success: true, 
          message: 'Order cancelled successfully',
          order: {
            orderId: updatedOrder.orderId,
            orderStatus: updatedOrder.orderStatus,
            cancelledAt: updatedOrder.cancelledAt
          }
        }, { headers });
      } catch (e) {
        return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500, headers });
      }
    }

    // Skip orderId requirement for archive/unarchive/cancel operations
    if (!body.orderId && !body.archive && !body.unarchive && !body.cancel && !Array.isArray(body.archiveOrderIds)) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400, headers }
      );
    }
    
    // Skip validation for archive/unarchive/cancel operations  
    if (!body.archive && !body.unarchive && !body.cancel && !Array.isArray(body.archiveOrderIds)) {
      // Validate update data
      const validation = validateOrderUpdate(body);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400, headers }
        );
      }
    }
    
    // Sanitize update data
    const sanitizedData = sanitizeOrderData(body);
    
    // Recalculate entire order if orderItems are provided
    let recalculatedData = { ...sanitizedData };
    const parsedOrderItems: unknown =
      typeof (sanitizedData as { orderItems?: unknown }).orderItems === 'string'
        ? (() => {
            try {
              return JSON.parse(String((sanitizedData as { orderItems: string }).orderItems));
            } catch {
              return null;
            }
          })()
        : (sanitizedData as { orderItems?: unknown }).orderItems;

    if (Array.isArray(parsedOrderItems)) {
      const orderItems = parsedOrderItems;
      const consistentOrderItems = await ensureAllPriceConsistency(orderItems);
      const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
      const totalQtyCalc = consistentOrderItems.reduce((sum, it) => {
        const piecesPerPackage = it.piecesPerPackage || 1;
        const packageQuantity = it.packageQuantity || 1;
        return sum + (packageQuantity * piecesPerPackage);
      }, 0);
      recalculatedData = {
        ...sanitizedData,
        subtotal: subtotalCalc,
        totalAmount: subtotalCalc + Number(sanitizedData.shippingFee || 0) - Number(sanitizedData.discounts || 0),
        totalOrders: totalQtyCalc,
      };
    }
    
    const updateData: Record<string, unknown> = recalculatedData;
    // Some Prisma client builds (and older generated artifacts) don't allow writing relation scalar FKs
    // directly (e.g. `userId`). Prefer relation updates for compatibility.
    if (typeof (sanitizedData as { userId?: unknown }).userId === 'number') {
      updateData.user = { connect: { id: (sanitizedData as { userId: number }).userId } };
    }
    if ('userId' in updateData) {
      delete (updateData as { userId?: unknown }).userId;
    }
    // `Order` doesn't have an `orderItems` scalar field in the current Prisma schema.
    // Order items are stored in `OrderItem` rows (`orderItemsRel`) and updated below.
    if ('orderItems' in updateData) {
      delete (updateData as { orderItems?: unknown }).orderItems;
    }
    if (sanitizedData.orderDate) {
      updateData.orderDate = new Date(String(sanitizedData.orderDate));
    }
    if (sanitizedData.acceptedAt) {
      updateData.acceptedAt = new Date(String(sanitizedData.acceptedAt));
    }

    const stockNotificationJobs: Array<{
      userId: number;
      productId: string;
      productName: string;
      previousStock: number;
      newStock: number;
      lowStockThreshold: number;
      variantName?: string;
    }> = [];

    let previousPaymentStatus: string | null = null;
    let previousOrderStatus: string | null = null;

    // Make status changes, stock adjustments, item replacement, and final update atomic.
    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Capture previous payment status for dedicated buyer notifications on payment transitions,
      // even when orderStatus isn't being updated in this request.
      if (
        typeof sanitizedData.orderId === 'string' &&
        (sanitizedData.orderStatus !== undefined || sanitizedData.paymentStatus !== undefined)
      ) {
        const existingForPayment = await tx.order.findUnique({
          where: { orderId: String(sanitizedData.orderId) },
          select: { paymentStatus: true, orderStatus: true },
        });
        if (existingForPayment) {
          previousPaymentStatus =
            typeof existingForPayment.paymentStatus === 'string'
              ? existingForPayment.paymentStatus
              : String(existingForPayment.paymentStatus || '');
          previousOrderStatus =
            typeof existingForPayment.orderStatus === 'string'
              ? existingForPayment.orderStatus
              : String(existingForPayment.orderStatus || '');
        }
      }

      if (sanitizedData.paymentStatus !== undefined) {
        const nextPaymentStatus = String(sanitizedData.paymentStatus);
        if (nextPaymentStatus === 'Paid' && previousPaymentStatus !== 'Paid') {
          updateData.paidAt = new Date();
        } else if (nextPaymentStatus === 'Unpaid' && previousPaymentStatus === 'Paid') {
          updateData.paidAt = null;
        }
      }

      // Auto-set acceptedAt on status transition to Confirmed when not provided
      if (!sanitizedData.acceptedAt && typeof sanitizedData.orderId === 'string' && sanitizedData.orderStatus) {
        const existing = await tx.order.findUnique({ where: { orderId: String(sanitizedData.orderId) } });
        if (existing) {
          const nextStatus = String(sanitizedData.orderStatus);
          const prevStatus = String(existing.orderStatus || '');
          // keep previousPaymentStatus from the earlier read; do not overwrite
          if (nextStatus === 'Confirmed' && !existing.acceptedAt) {
            updateData.acceptedAt = new Date();
            if (!sanitizedData.acceptedBy && !existing.acceptedBy) {
              updateData.acceptedBy = 'Admin';
            }
          }

          // Update deliveredAt whenever status is set to Delivered (including after revert to Pending and back)
          if (nextStatus === 'Delivered') {
            updateData.deliveredAt = new Date();
          }

          // STOCK MANAGEMENT: Simple logic based on status
          const orderWithItems = await tx.order.findUnique({
            where: { orderId: String(sanitizedData.orderId) },
            include: {
              orderItemsRel: true,
            },
          });

          const noDeductStatuses = ['Pending', 'Cancelled', 'Returned', 'Failed'];
          const prevStatusNoDeduct = noDeductStatuses.includes(prevStatus);
          const nextStatusNoDeduct = noDeductStatuses.includes(nextStatus);

          // RESTORE STOCK: Moving TO Pending, Cancelled, or Returned from any other status
          if (!prevStatusNoDeduct && nextStatusNoDeduct && orderWithItems) {
            for (const orderItem of orderWithItems.orderItemsRel) {
            if (!orderItem.productId) continue;
            
            // Calculate total quantity to restore (including free items from promotion)
            const totalQtyToRestore = calculateTotalQuantityWithPromotions(orderItem);
            
            // Get the product and variant for stock restoration
            const productForRestore = await tx.product.findFirst({
              where: { productId: orderItem.productId || '' },
              include: { variantOptions: true, variants: true }
            });
            
            if (!productForRestore) {
              continue; // Skip if product not found
            }
            
            // Find the specific variant to restore stock to
            let variantToRestore = null;
            
            // First try variantOptionId (most accurate)
            if (orderItem.variantOptionId) {
              variantToRestore = productForRestore.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantOptionId
              ) || null;
            }
            
            // If not found, try variantId
            if (!variantToRestore && orderItem.variantId) {
              variantToRestore = productForRestore.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantId
              ) || null;
            }
            
            // Do not fall back to "first variant" because it can update the wrong SKU.
            if (!variantToRestore) {
              console.warn(
                '[Orders] Stock restore skipped: variant not found',
                JSON.stringify({
                  productId: orderItem.productId,
                  variantOptionId: orderItem.variantOptionId ?? null,
                  variantId: orderItem.variantId ?? null,
                }),
              );
              continue;
            }
            
            // Restore stock at variant level (piece-based system)
            const newStock = ((variantToRestore as { stockQuantity?: number }).stockQuantity || 0) + totalQtyToRestore;
            let newStockStatus = (variantToRestore as { stockStatus?: string }).stockStatus || 'In Stock';
            
            // Update stock status based on threshold
            const lowStockThreshold = (variantToRestore as { lowStockThreshold?: number }).lowStockThreshold || 0;
            if (newStock <= 0) {
              newStockStatus = 'Out of Stock';
            } else if (lowStockThreshold > 0 && newStock <= lowStockThreshold) {
              newStockStatus = 'Low Stock';
            } else {
              newStockStatus = 'In Stock';
            }
            
            // Update using variantOption model
            const previousStock = (variantToRestore as { stockQuantity?: number }).stockQuantity || 0;
            await tx.variantOption.update({
              where: { id: (variantToRestore as { id: number }).id },
              data: {
                stockQuantity: newStock,
                stockStatus: newStockStatus
              }
            });

            // Check and notify if stock level crossed a threshold
            if (productForRestore && productForRestore.userId) {
              const variantName = (variantToRestore as { variantName?: string }).variantName || undefined;
              stockNotificationJobs.push({
                userId: productForRestore.userId,
                productId: productForRestore.productId,
                productName: productForRestore.name,
                previousStock,
                newStock,
                lowStockThreshold,
                variantName,
              });
            }
          }
        }
        
        // DEDUCT STOCK: Moving FROM Pending, Cancelled, or Returned TO any other status
        if (prevStatusNoDeduct && !nextStatusNoDeduct && orderWithItems) {
          for (const orderItem of orderWithItems.orderItemsRel) {
            if (!orderItem.productId) continue;
            
            // Calculate total quantity to deduct (including free items from promotion)
            const totalQtyToDeduct = calculateTotalQuantityWithPromotions(orderItem);
            
            // Get the product and variant for stock deduction
            const productForDeduct = await tx.product.findFirst({
              where: { productId: orderItem.productId || '' },
              include: { variantOptions: true, variants: true }
            });
            
            if (!productForDeduct) {
              continue; // Skip if product not found
            }
            
            // Find the specific variant to deduct stock from
            let variantToDeduct = null;
            
            // First try variantOptionId (most accurate)
            if (orderItem.variantOptionId) {
              variantToDeduct = productForDeduct.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantOptionId
              ) || null;
            }
            
            // If not found, try variantId
            if (!variantToDeduct && orderItem.variantId) {
              variantToDeduct = productForDeduct.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantId
              ) || null;
            }
            
            // Do not fall back to "first variant" because it can update the wrong SKU.
            if (!variantToDeduct) {
              console.warn(
                '[Orders] Stock deduct skipped: variant not found',
                JSON.stringify({
                  productId: orderItem.productId,
                  variantOptionId: orderItem.variantOptionId ?? null,
                  variantId: orderItem.variantId ?? null,
                }),
              );
              continue;
            }
            
            // Deduct stock at variant level (piece-based system)
            const newStock = ((variantToDeduct as { stockQuantity?: number }).stockQuantity || 0) - totalQtyToDeduct;
            let newStockStatus = (variantToDeduct as { stockStatus?: string }).stockStatus || 'In Stock';
            
            // Update stock status based on threshold
            const lowStockThreshold = (variantToDeduct as { lowStockThreshold?: number }).lowStockThreshold || 0;
            if (newStock <= 0) {
              newStockStatus = 'Out of Stock';
            } else if (lowStockThreshold > 0 && newStock <= lowStockThreshold) {
              newStockStatus = 'Low Stock';
            } else {
              newStockStatus = 'In Stock';
            }
            
            // Update using variantOption model
            const previousStock = (variantToDeduct as { stockQuantity?: number }).stockQuantity || 0;
            await tx.variantOption.update({
              where: { id: (variantToDeduct as { id: number }).id },
              data: {
                stockQuantity: Math.max(0, newStock),
                stockStatus: newStockStatus
              }
            });

            // Check and notify if stock level crossed a threshold
            if (productForDeduct && productForDeduct.userId) {
              const variantName = (variantToDeduct as { variantName?: string }).variantName || undefined;
              stockNotificationJobs.push({
                userId: productForDeduct.userId,
                productId: productForDeduct.productId,
                productName: productForDeduct.name,
                previousStock,
                newStock: Math.max(0, newStock),
                lowStockThreshold,
                variantName,
              });
            }
          }
        }
      }
    }
      // For backward compatibility, don't require userId for updates
      const updatedOrder = await tx.order.update({
        where: { orderId: String(sanitizedData.orderId) },
        data: updateData,
        include: {
          buyer: true,
          user: true,
          orderItemsRel: {
            include: { product: true },
          },
        },
      });

      // Update OrderItem records if orderItems were provided
      if (Array.isArray(parsedOrderItems)) {
        // Delete existing OrderItem records for this order
        await tx.orderItem.deleteMany({
          where: { orderId: sanitizedData.orderId as string },
        });

        // Create new OrderItem records with price consistency
        const orderItemPromises = (parsedOrderItems as Array<{ productId: string; quantity: number }>).map(
          async (item: { productId: string; quantity: number }) => {
            // Fetch the product with variants to ensure price consistency
            const product = await tx.product.findFirst({
              where: { productId: item.productId },
              include: { variantOptions: true, variants: true },
            });

            if (!product) {
              throw new Error(`Product not found: ${item.productId}`);
            }

            // Use the selected variant's sellingPrice when available; fall back to first variant only when missing.
            // Use variantOptions for pricing/stock (new structure) - now Decimal type, not string.
            const itemWithVariant = item as { variantOptionId?: number | null; variantId?: number | null };
            const selectedVariant = selectVariantOption(product, itemWithVariant);
            const consistentUnitPrice = selectedVariant ? getUnitPriceFromVariantOption(selectedVariant) : 0;
            if (!selectedVariant || consistentUnitPrice <= 0) {
              throw new Error(`No variants with pricing found for product: ${item.productId}`);
            }

            const consistentSubtotal = consistentUnitPrice * Number(item.quantity || 0);

            return tx.orderItem.create({
              data: {
                orderId: sanitizedData.orderId as string,
                productId: item.productId as string,
                subtotal: consistentSubtotal,
                productNameSnapshot: product.name,
                productSkuSnapshot: product.sku,
                productTypeSnapshot: product.productType,
                packageQuantity: (item as { packageQuantity?: number }).packageQuantity || 1,
                packageType: (item as { packageType?: string }).packageType,
                piecesPerPackage: (item as { piecesPerPackage?: number }).piecesPerPackage || 1,
                pricePerPackage: (item as { pricePerPackage?: number }).pricePerPackage || consistentUnitPrice,
              },
            });
          },
        );

        await Promise.all(orderItemPromises);
      }

      return updatedOrder;
    });

    // Run stock notifications best-effort after DB commit.
    for (const job of stockNotificationJobs) {
      try {
        await NotificationService.checkAndNotifyStockLevel(
          job.userId,
          job.productId,
          job.productName,
          job.previousStock,
          job.newStock,
          job.lowStockThreshold,
          job.variantName,
        );
      } catch (notifError) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Orders] Stock notification failed:', notifError);
        }
      }
    }

    // Build items from relational rows for response
    const enrichedOrderItemsUpdate = ((order as { orderItemsRel?: Array<{ productId: string | null; subtotal: number | { toNumber?: () => number; toString?: () => string } | unknown; packageQuantity?: number; packageType?: string; piecesPerPackage?: number; pricePerPackage?: number | { toNumber?: () => number; toString?: () => string } | null | unknown; product?: { name: string; productType: string; brand: string; description: string; images: string[] } | null; productNameSnapshot?: string; productSkuSnapshot?: string; productTypeSnapshot?: string }> }).orderItemsRel || []).map((oi) => ({
      productId: oi.productId ?? null,
      subtotal: decimalToNumber(oi.subtotal), // Convert Decimal to number
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage ? decimalToNumber(oi.pricePerPackage) : null, // Convert Decimal to number
      productName: oi.product?.name || oi.productNameSnapshot || 'Unknown Product',
      category: oi.product?.productType || oi.productTypeSnapshot || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: oi.productNameSnapshot || null,
      productSkuSnapshot: oi.productSkuSnapshot || null,
      productTypeSnapshot: oi.productTypeSnapshot || null
    }));

    // Auto-sync order to buyer profile if buyerId exists and order was updated
    if (order.buyerId && sanitizedData.userId) {
      try {
        await syncOrderToBuyerProfile(order.buyerId, sanitizedData.userId as number);
      } catch (syncError) {
        // Log error but don't fail the order update
      }
    }

    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch (error) {
      // Ignore broadcast errors
    }
    if (sanitizedData.orderStatus || sanitizedData.orderItems) {
      await broadcastSoldCountUpdates(order.orderId);
    }

    // Create notification for order status change (for distributor dashboard)
    if (
      sanitizedData.orderStatus &&
      sanitizedData.orderStatus !== 'Pending' &&
      sanitizedData.orderStatus !== 'Received' &&
      String(sanitizedData.orderStatus) !== (previousOrderStatus ?? '') &&
      order.userId
    ) {
      try {
        await NotificationService.createOrderNotification(
          order.userId,
          order.orderId,
          String(sanitizedData.orderStatus),
          order.storeName || 'Unknown Store',
          decimalToNumber((order as { totalAmount?: unknown }).totalAmount)
        );
      } catch (notifError) {
        // Don't fail the order update if notification creation fails
      }
    }

    // Notify marketplace buyer on payment status transitions (dedicated message; mirror orderStatus push behavior).
    if (
      sanitizedData.paymentStatus !== undefined &&
      String(sanitizedData.paymentStatus) === 'Paid' &&
      previousPaymentStatus !== 'Paid'
    ) {
      try {
        const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
        if (marketplaceUserId != null) {
          const payload = { orderId: order.orderId, paymentStatus: 'Paid', type: 'payment' };
          const payTranslations = translateMarketplacePaymentConfirmed({ orderId: order.orderId });
          const { tokenCount } = await sendExpoPushToMarketplaceUser(
            marketplaceUserId,
            payTranslations,
            payload,
          );
          if (tokenCount === 0) {
            await broadcastNotification(
              'payment',
              payTranslations.en.title,
              payTranslations.en.body,
              payload,
              marketplaceUserId,
            );
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.warn('[Orders] PaymentStatus: buyerId not parseable for Expo/WebSocket, buyerId=', String(order.buyerId ?? ''));
        }
      } catch {
        // best-effort
      }
    }

    if (
      sanitizedData.paymentStatus !== undefined &&
      String(sanitizedData.paymentStatus) === 'Unpaid' &&
      previousPaymentStatus !== null &&
      previousPaymentStatus !== 'Unpaid'
    ) {
      try {
        const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
        if (marketplaceUserId != null) {
          const payload = { orderId: order.orderId, paymentStatus: 'Unpaid', type: 'payment' };
          const payTranslations = translateMarketplacePaymentUnpaid({ orderId: order.orderId });
          const { tokenCount } = await sendExpoPushToMarketplaceUser(
            marketplaceUserId,
            payTranslations,
            payload,
          );
          if (tokenCount === 0) {
            await broadcastNotification(
              'payment',
              payTranslations.en.title,
              payTranslations.en.body,
              payload,
              marketplaceUserId,
            );
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.warn('[Orders] PaymentStatus: buyerId not parseable for Expo/WebSocket, buyerId=', String(order.buyerId ?? ''));
        }
      } catch {
        // best-effort
      }
    }

    // Notify marketplace buyer + driver (order status changes)
    if (sanitizedData.orderStatus) {
      try {
        const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
        if (marketplaceUserId != null) {
          const orderStatus = String(sanitizedData.orderStatus);
          if (orderStatus === (previousOrderStatus ?? '')) {
            // Avoid duplicate "Order Update" notifications when client re-sends the same status
            // (e.g. when only paymentStatus changed).
            // Still allow broadcastOrderUpdate for data refresh elsewhere.
            throw new Error('__skip_order_status_notification__');
          }
          const orderPushTranslations = translateMarketplaceBuyerOrderStatus({
            orderId: order.orderId,
            status: orderStatus,
          });
          const orderPayload = { orderId: order.orderId, orderStatus, type: 'order' as const };
          const { tokenCount } = await sendExpoPushToMarketplaceUser(
            marketplaceUserId,
            orderPushTranslations,
            orderPayload,
          );
          if (tokenCount === 0) {
            await broadcastNotification(
              'order',
              orderPushTranslations.en.title,
              orderPushTranslations.en.body,
              orderPayload,
              marketplaceUserId,
            );
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.warn('[Orders] Status: buyerId not parseable for Expo/WebSocket, buyerId=', String(order.buyerId ?? ''));
        }
      } catch (notifError) {
        if (notifError instanceof Error && notifError.message === '__skip_order_status_notification__') {
          // no-op
        } else {
          // Don't fail the order update if notification fails
        }
      }

      try {
        const orderWithFleet = await prisma.order.findUnique({
          where: { orderId: order.orderId },
          select: { fleet: { select: { driverId: true, fleetCode: true } } },
        });
        const driverId = orderWithFleet?.fleet?.driverId;
        const fleetCode = orderWithFleet?.fleet?.fleetCode;
        if (driverId) {
          const orderStatus = String(sanitizedData.orderStatus);
          const translations = translateDriverOrderUpdate({
            orderId: String(order.orderId),
            status: orderStatus,
            fleetCode: fleetCode ?? undefined,
          });
          await sendExpoPushToDriver(driverId, translations, {
            type: 'order_updated',
            orderId: order.orderId,
            orderStatus,
            fleetCode: fleetCode ?? '',
          });
        }
      } catch {
        // Best-effort
      }
    }

    // Convert order-level Decimal fields to numbers
    const orderResponse = {
      ...order,
      subtotal: decimalToNumber((order as { subtotal?: unknown }).subtotal),
      discounts: decimalToNumber((order as { discounts?: unknown }).discounts),
      shippingFee: decimalToNumber((order as { shippingFee?: unknown }).shippingFee),
      totalAmount: decimalToNumber((order as { totalAmount?: unknown }).totalAmount),
      orderItems: enrichedOrderItemsUpdate
    };
    
    // Invalidate dashboard cache after order update
    if (order.userId) {
      try {
        const { invalidateDashboardCache, invalidateProductCache } = await import('@/lib/queryCache');
        await Promise.all([
          invalidateDashboardCache(order.userId),
          // Order status transitions can restore/deduct stock; clear product list cache so the table refreshes correctly.
          invalidateProductCache(order.userId),
        ]);
      } catch (error) {
        // Ignore cache invalidation errors
      }
    }
    
    return NextResponse.json(orderResponse, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to update order', detail: String(error instanceof Error ? error.message : error) }, 
      { status: 500, headers }
    );
  }
}

