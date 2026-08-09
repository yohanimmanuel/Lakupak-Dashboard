import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { broadcastDashboardNotification, broadcastNotification, broadcastOrderUpdate } from '@/utils/websocketBroadcast';
import { sendExpoPushToMarketplaceUser } from '@/utils/expoPush';
import { translateMarketplacePaymentIntentSubmitted } from '@/utils/marketplacePushTranslations';
import { marketplacePayIntentRateLimiter } from '@/utils/rateLimiter';
import { sanitizePaymentProofFileNames, sanitizePaymentProofUrls } from '@/utils/paymentProof';
import { isBankTransferPaymentTerms } from '@/utils/orderPayment';
import { auditOrder } from '@/lib/audit';
import { dispatchOrderPaidProofAutomations } from '@/lib/automations/engine';
import { enqueueSideEffect } from '@/lib/sideEffectQueue';

/**
 * POST /api/mobile/orders/[id]/pay-intent
 * Buyer indicates they will pay via manual transfer; we notify the distributor.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const headers = getSecurityHeaders();

  try {
    const { getAuthenticatedMarketplaceUserId } = await import('@/utils/auth-helpers');
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const marketplaceUserId = auth.userId;

    // Rate limiting: pay intent triggers fanout (DB notification, WS, push)
    const rateLimitResponse = await marketplacePayIntentRateLimiter(request, marketplaceUserId);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const orderIdNum = parseInt(id, 10);
    if (!Number.isFinite(orderIdNum) || orderIdNum < 1) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400, headers });
    }

    const body = await request.json().catch(() => ({}));
    const proofUrls = sanitizePaymentProofUrls(body?.proofUrls ?? body?.imageUrls);
    const proofFileNames = sanitizePaymentProofFileNames(body?.proofFileNames);
    const updatePaymentIntent = body?.updatePaymentIntent === true;

    const order = await prisma.order.findUnique({
      where: { id: orderIdNum },
      select: {
        id: true,
        orderId: true,
        buyerId: true,
        userId: true,
        paymentStatus: true,
        paymentTerms: true,
        orderStatus: true,
        storeName: true,
        totalAmount: true,
        paymentProofSubmittedAt: true,
        paymentProofUrls: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
    }

    const orderBuyerMarketplaceId = parseMarketplaceUserIdFromBuyerId(order.buyerId);
    if (orderBuyerMarketplaceId === null || orderBuyerMarketplaceId !== marketplaceUserId) {
      return NextResponse.json({ error: 'You can only pay your own orders' }, { status: 403, headers });
    }

    // Prevent pay intent on orders that are not awaiting payment
    if (order.paymentStatus === 'Paid') {
      return NextResponse.json({ error: 'Order is already paid' }, { status: 400, headers });
    }
    if (order.orderStatus === 'cancelled' || order.orderStatus === 'rejected') {
      return NextResponse.json({ error: 'Cannot pay for a cancelled order' }, { status: 400, headers });
    }

    const isBankTransfer = isBankTransferPaymentTerms(order.paymentTerms);
    if (isBankTransfer && proofUrls.length === 0) {
      return NextResponse.json(
        { error: 'Payment proof (photo or PDF) is required for bank transfer orders' },
        { status: 400, headers },
      );
    }

    const alreadySubmitted =
      !!order.paymentProofSubmittedAt || (order.paymentProofUrls?.length ?? 0) > 0;
    const isUpdate = updatePaymentIntent && alreadySubmitted;

    if (updatePaymentIntent && !alreadySubmitted) {
      return NextResponse.json({ error: 'No payment intent to update' }, { status: 400, headers });
    }

    if (proofUrls.length > 0) {
      await prisma.order.update({
        where: { id: orderIdNum },
        data: {
          paymentProofUrls: proofUrls,
          paymentProofFileNames: proofUrls.map((_, i) => proofFileNames[i] ?? ''),
          paymentProofSubmittedAt: order.paymentProofSubmittedAt ?? new Date(),
        },
      });

      // Live automations: order_paid (proof_submitted) → mark_paid_from_proof / notify_dashboard
      if (typeof order.userId === 'number' && order.userId > 0) {
        const distributorId = order.userId;
        const orderIdStr = order.orderId;
        enqueueSideEffect(
          `automationOrderPaidProof(${orderIdStr})`,
          async () => {
            await dispatchOrderPaidProofAutomations({
              userId: distributorId,
              orderId: orderIdStr,
              orderNumericId: orderIdNum,
            });
          },
          { retries: 1, initialDelayMs: 100 },
        );
      }
    }

    const proofNote =
      proofUrls.length > 0
        ? ' Payment proof is attached; open the order to review receipts.'
        : '';

    const distributorUserId = order.userId ?? null;
    if (!isUpdate && typeof distributorUserId === 'number' && distributorUserId > 0) {
      try {
        await prisma.notification.create({
          data: {
            userId: distributorUserId,
            type: 'payment',
            title: 'Buyer initiated payment',
            message: `Buyer initiated payment for order #${order.orderId}. Please verify and set Payment Status to Paid when received.${proofNote}`,
            metadata: { orderId: order.orderId, type: 'payment' },
            actionUrl: `/orders/details/${order.orderId}`,
          },
        });

        await broadcastDashboardNotification(distributorUserId);
        await broadcastNotification(
          'payment',
          'Buyer initiated payment',
          `Order #${order.orderId}: buyer initiated payment. Verify incoming transfer and mark as Paid when received.${proofNote}`,
          { orderId: order.orderId, type: 'payment' },
          distributorUserId,
          'dashboard',
        );
      } catch {
        // best-effort
      }
    }

    if (isUpdate && typeof distributorUserId === 'number' && distributorUserId > 0) {
      try {
        await prisma.notification.create({
          data: {
            userId: distributorUserId,
            type: 'payment',
            title: 'Payment proof updated',
            message: `Buyer updated payment proof for order #${order.orderId}. Please review the new receipt.${proofNote}`,
            metadata: { orderId: order.orderId, type: 'payment' },
            actionUrl: `/orders/details/${order.orderId}`,
          },
        });

        await broadcastDashboardNotification(distributorUserId);
        await broadcastNotification(
          'payment',
          'Payment proof updated',
          `Order #${order.orderId}: buyer updated payment proof. Review the new receipt.`,
          { orderId: order.orderId, type: 'payment' },
          distributorUserId,
          'dashboard',
        );
      } catch {
        // best-effort
      }
    }

    if (!isUpdate) {
      try {
        const payIntentTranslations = translateMarketplacePaymentIntentSubmitted({ orderId: order.orderId });
        const payload = { orderId: order.orderId, type: 'payment' };
        const { tokenCount } = await sendExpoPushToMarketplaceUser(
          marketplaceUserId,
          payIntentTranslations,
          payload,
        );
        if (tokenCount === 0) {
          await broadcastNotification(
            'payment',
            payIntentTranslations.en.title,
            payIntentTranslations.en.body,
            payload,
            marketplaceUserId,
            'marketplace',
          );
        }
      } catch {
        // best-effort
      }
    }

    // Trigger order refresh in real-time UIs
    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch {
      // ignore
    }

    auditOrder(request, {
      action: isUpdate ? 'pay_intent_update' : 'pay_intent',
      resourceId: order.orderId,
      actorId: marketplaceUserId,
      actorType: 'marketplace',
      metadata: { proofCount: proofUrls.length, bankTransfer: isBankTransfer },
    });

    return NextResponse.json({ ok: true, updated: isUpdate }, { status: 200, headers });
  } catch (error) {
    console.error('[mobile/orders/[id]/pay-intent] POST error', error);
    return NextResponse.json({ error: 'Failed to send payment notification' }, { status: 500, headers });
  }
}

