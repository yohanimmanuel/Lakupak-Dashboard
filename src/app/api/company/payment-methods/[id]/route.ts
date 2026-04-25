import { NextRequest, NextResponse } from 'next/server';
import type { CompanyPaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { getSecurityHeaders } from '@/utils/auth-security';
import {
  isPlainObject,
  parsePositiveInt,
  readOptionalInt,
  readOptionalTrimmedString,
  readOptionalTrimmedStringOrNull,
  lastDigitsFromAccountInput,
  parseStatus,
  type CompanyPaymentMethodResponseJson,
} from '../paymentMethodRouteTypes';
import { broadcastProductUpdatesForCompanyId } from '@/utils/broadcastCompanyProductUpdates';

function serializePaymentMethod(row: CompanyPaymentMethod): CompanyPaymentMethodResponseJson {
  return {
    id: row.id,
    companyId: row.companyId,
    kind: row.kind,
    label: row.label,
    last4: row.last4,
    expiryMonth: row.expiryMonth,
    expiryYear: row.expiryYear,
    bankName: row.bankName,
    accountHolderName: row.accountHolderName,
    accountNumberLast4: row.accountNumberLast4,
    ewalletProvider: row.ewalletProvider,
    isDefault: row.isDefault,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveCompanyIdForUser(userId: number): Promise<number | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return u?.companyId ?? null;
}

async function assertMethodOwnedByUserCompany(
  methodId: string,
  userId: number
): Promise<{ method: CompanyPaymentMethod; companyId: number } | null> {
  const companyId = await resolveCompanyIdForUser(userId);
  if (!companyId) return null;

  const method = await prisma.companyPaymentMethod.findFirst({
    where: { id: methodId, companyId },
  });
  if (!method) return null;
  return { method, companyId };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const headers = getSecurityHeaders();

  try {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401, headers });
    }

    const { id: methodId } = await context.params;
    if (!methodId || typeof methodId !== 'string') {
      return NextResponse.json({ error: 'Invalid payment method id' }, { status: 400, headers });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
    }

    if (!isPlainObject(body)) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
    }

    const userId = parsePositiveInt(body.userId);
    if (userId === null) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400, headers });
    }

    if (authenticatedUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers });
    }

    const owned = await assertMethodOwnedByUserCompany(methodId, userId);
    if (!owned) {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404, headers });
    }

    const isDefault = body.isDefault === true ? true : body.isDefault === false ? false : undefined;

    const data: Prisma.CompanyPaymentMethodUpdateInput = {};

    if ('label' in body) {
      const next = readOptionalTrimmedString(body.label);
      if (!next) {
        return NextResponse.json({ error: 'Label cannot be empty' }, { status: 400, headers });
      }
      data.label = next;
    }
    if ('cardNumber' in body) {
      const cardNumberInput = readOptionalTrimmedString(body.cardNumber);
      if (cardNumberInput) {
        data.last4 = lastDigitsFromAccountInput(cardNumberInput, 4);
      }
    }
    if ('last4' in body && !('cardNumber' in body)) {
      data.last4 = readOptionalTrimmedStringOrNull(body.last4) ?? null;
    }
    if ('expiryMonth' in body) data.expiryMonth = readOptionalInt(body.expiryMonth) ?? null;
    if ('expiryYear' in body) data.expiryYear = readOptionalInt(body.expiryYear) ?? null;
    if ('bankName' in body) data.bankName = readOptionalTrimmedStringOrNull(body.bankName) ?? null;
    if ('accountHolderName' in body) data.accountHolderName = readOptionalTrimmedStringOrNull(body.accountHolderName) ?? null;
    if ('ewalletProvider' in body) data.ewalletProvider = readOptionalTrimmedStringOrNull(body.ewalletProvider) ?? null;
    if ('status' in body) {
      const nextStatus = parseStatus(body.status);
      if (nextStatus === null) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400, headers });
      }
      data.status = nextStatus;
    }

    if ('accountNumberLast4' in body || 'accountNumber' in body) {
      let nextLast4 = 'accountNumberLast4' in body ? readOptionalTrimmedStringOrNull(body.accountNumberLast4) : undefined;
      const accountNumberInput = readOptionalTrimmedString(body.accountNumber);
      if (accountNumberInput) {
        nextLast4 = lastDigitsFromAccountInput(accountNumberInput, 4);
      }
      if ('accountNumberLast4' in body || accountNumberInput) {
        data.accountNumberLast4 = nextLast4 ?? null;
      }
    }

    if (isDefault !== undefined) data.isDefault = isDefault;

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.companyPaymentMethod.updateMany({
          where: { companyId: owned.companyId },
          data: { isDefault: false },
        });
      }

      if (Object.keys(data).length === 0) {
        return tx.companyPaymentMethod.findUniqueOrThrow({ where: { id: methodId } });
      }

      return tx.companyPaymentMethod.update({
        where: { id: methodId },
        data,
      });
    });

    await broadcastProductUpdatesForCompanyId(owned.companyId);

    return NextResponse.json(serializePaymentMethod(updated), { status: 200, headers });
  } catch (e) {
    console.error('PATCH /api/company/payment-methods/[id] error:', e);
    return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500, headers });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const headers = getSecurityHeaders();

  try {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401, headers });
    }

    const { id: methodId } = await context.params;
    if (!methodId || typeof methodId !== 'string') {
      return NextResponse.json({ error: 'Invalid payment method id' }, { status: 400, headers });
    }

    const { searchParams } = new URL(request.url);
    const userId = parsePositiveInt(searchParams.get('userId'));
    if (userId === null) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400, headers });
    }

    if (authenticatedUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers });
    }

    const owned = await assertMethodOwnedByUserCompany(methodId, userId);
    if (!owned) {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404, headers });
    }

    const companyId = owned.companyId;

    await prisma.companyPaymentMethod.delete({ where: { id: methodId } });

    await broadcastProductUpdatesForCompanyId(companyId);

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (e) {
    console.error('DELETE /api/company/payment-methods/[id] error:', e);
    return NextResponse.json({ error: 'Failed to delete payment method' }, { status: 500, headers });
  }
}
