import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { Prisma } from '@/lib/prisma-generated';
import { getAssortmentOpportunity, updateAssortmentOpportunityStatus } from '@/lib/assortmentOpportunities/service';

function decimal(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const headers = getSecurityHeaders();
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const { id } = await context.params;
  const result = await getAssortmentOpportunity(userId, id);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
  const { opportunity, history } = result;
  return NextResponse.json(
    {
      opportunity: {
        ...opportunity,
        confidence: decimal(opportunity.confidence),
        penetration: decimal(opportunity.penetration),
        lastPurchasedAt: opportunity.lastPurchasedAt?.toISOString() ?? null,
        reviewedAt: opportunity.reviewedAt?.toISOString() ?? null,
        generatedAt: opportunity.generatedAt.toISOString(),
        updatedAt: opportunity.updatedAt.toISOString(),
        events: opportunity.events.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
      },
      history: history.map((line) => ({
        orderId: line.order.orderId,
        orderStatus: line.order.orderStatus,
        orderDate: line.order.orderDate.toISOString(),
        productName: line.productNameSnapshot,
        variantName: line.variantNameSnapshot,
        sku: line.productSkuSnapshot,
        quantity: line.packageQuantity,
        unitPrice: decimal(line.unitPriceSnapshot ?? line.pricePerPackage),
        sameSku: line.variantOptionId === opportunity.variantOptionId,
      })),
    },
    { headers },
  );
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const headers = getSecurityHeaders();
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const status = body?.status;
  if (status !== 'open' && status !== 'reviewed' && status !== 'dismissed') {
    return NextResponse.json({ error: 'Status is invalid' }, { status: 400, headers });
  }
  const updated = await updateAssortmentOpportunityStatus(userId, id, status);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
  return NextResponse.json({ id: updated.id, status: updated.status }, { headers });
}
