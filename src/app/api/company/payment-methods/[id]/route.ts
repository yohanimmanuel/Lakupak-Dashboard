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
  parseKind,
  buildPaymentMethodLabel,
  isValidCardExpiry,
  type CompanyPaymentMethodResponseJson,
} from '../paymentMethodRouteTypes';
import { broadcastProductUpdatesForCompanyId } from '@/utils/broadcastCompanyProductUpdates';
import { settingsOperationRateLimiter } from '@/utils/rateLimiter';
import { auditAccount } from '@/lib/audit';

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

    const rateLimitResponse = await settingsOperationRateLimiter(request, authenticatedUserId);
    if (rateLimitResponse) return rateLimitResponse;

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

    const nextKindParsed = 'kind' in body ? parseKind(body.kind) : undefined;
    if ('kind' in body && nextKindParsed === null) {
      return NextResponse.json({ error: 'Invalid payment method kind' }, { status: 400, headers });
    }
    const kind = nextKindParsed ?? owned.method.kind;
    const kindChanged = nextKindParsed != null && nextKindParsed !== owned.method.kind;

    let last4 = owned.method.last4;
    let expiryMonth = owned.method.expiryMonth;
    let expiryYear = owned.method.expiryYear;
    let bankName = owned.method.bankName;
    let accountHolderName = owned.method.accountHolderName;
    let accountNumberLast4 = owned.method.accountNumberLast4;
    let ewalletProvider = owned.method.ewalletProvider;
    let status = owned.method.status;

    if ('cardNumber' in body) {
      const cardNumberInput = readOptionalTrimmedString(body.cardNumber);
      if (cardNumberInput) {
        last4 = lastDigitsFromAccountInput(cardNumberInput, 4);
      }
    } else if ('last4' in body) {
      last4 = readOptionalTrimmedStringOrNull(body.last4) ?? null;
    }
    if ('expiryMonth' in body) expiryMonth = readOptionalInt(body.expiryMonth) ?? null;
    if ('expiryYear' in body) expiryYear = readOptionalInt(body.expiryYear) ?? null;
    if ('bankName' in body) bankName = readOptionalTrimmedStringOrNull(body.bankName) ?? null;
    if ('accountHolderName' in body) {
      accountHolderName = readOptionalTrimmedStringOrNull(body.accountHolderName) ?? null;
    }
    if ('ewalletProvider' in body) {
      ewalletProvider = readOptionalTrimmedStringOrNull(body.ewalletProvider) ?? null;
    }
    if ('status' in body) {
      const nextStatus = parseStatus(body.status);
      if (nextStatus === null) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400, headers });
      }
      status = nextStatus;
    }
    if ('accountNumberLast4' in body || 'accountNumber' in body) {
      let nextLast4 =
        'accountNumberLast4' in body ? readOptionalTrimmedStringOrNull(body.accountNumberLast4) : undefined;
      const accountNumberInput = readOptionalTrimmedString(body.accountNumber);
      if (accountNumberInput) {
        nextLast4 = lastDigitsFromAccountInput(accountNumberInput, 4);
      }
      if ('accountNumberLast4' in body || accountNumberInput) {
        accountNumberLast4 = nextLast4 ?? null;
      }
    }

    if (kindChanged) {
      if (kind === 'CARD') {
        bankName = null;
        accountHolderName = null;
        accountNumberLast4 = null;
        ewalletProvider = null;
      } else if (kind === 'BANK_TRANSFER') {
        last4 = null;
        expiryMonth = null;
        expiryYear = null;
        ewalletProvider = null;
      } else {
        last4 = null;
        expiryMonth = null;
        expiryYear = null;
        bankName = null;
        accountHolderName = null;
        accountNumberLast4 = null;
      }
    }

    if (kind === 'CARD') {
      if (!last4 || last4.length < 4) {
        return NextResponse.json(
          { error: 'Card number (at least 4 digits) is required for cards' },
          { status: 400, headers }
        );
      }
      if (!isValidCardExpiry(expiryMonth, expiryYear)) {
        return NextResponse.json(
          { error: 'Valid card expiry month (1–12) and year are required' },
          { status: 400, headers }
        );
      }
    }
    if (kind === 'BANK_TRANSFER') {
      if (!bankName || !accountHolderName) {
        return NextResponse.json(
          { error: 'Bank name and account holder name are required for bank transfer' },
          { status: 400, headers }
        );
      }
      if (!accountNumberLast4 || accountNumberLast4.length < 4) {
        return NextResponse.json(
          { error: 'Account number (at least 4 digits) is required for bank transfer' },
          { status: 400, headers }
        );
      }
    }
    if (kind === 'EWALLET' && !ewalletProvider) {
      return NextResponse.json({ error: 'E-wallet provider is required' }, { status: 400, headers });
    }

    const labelFromBody = 'label' in body ? readOptionalTrimmedString(body.label) : undefined;
    if ('label' in body && !labelFromBody) {
      return NextResponse.json({ error: 'Label cannot be empty' }, { status: 400, headers });
    }
    const label =
      labelFromBody ??
      buildPaymentMethodLabel({ kind, last4, bankName, ewalletProvider });

    const data: Prisma.CompanyPaymentMethodUpdateInput = {
      kind,
      label,
      last4: kind === 'CARD' ? last4 : null,
      expiryMonth: kind === 'CARD' ? expiryMonth : null,
      expiryYear: kind === 'CARD' ? expiryYear : null,
      bankName: kind === 'BANK_TRANSFER' ? bankName : null,
      accountHolderName: kind === 'BANK_TRANSFER' ? accountHolderName : null,
      accountNumberLast4: kind === 'BANK_TRANSFER' ? accountNumberLast4 : null,
      ewalletProvider: kind === 'EWALLET' ? ewalletProvider : null,
      status,
    };
    if (isDefault !== undefined) data.isDefault = isDefault;

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.companyPaymentMethod.updateMany({
          where: { companyId: owned.companyId },
          data: { isDefault: false },
        });
      }

      return tx.companyPaymentMethod.update({
        where: { id: methodId },
        data,
      });
    });

    await broadcastProductUpdatesForCompanyId(owned.companyId);

    auditAccount(request, {
      action: 'payment_method.update',
      actorType: 'dashboard',
      actorId: authenticatedUserId,
      resourceType: 'CompanyPaymentMethod',
      resourceId: methodId,
      metadata: { companyId: owned.companyId, fields: Object.keys(data) },
    });

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

    const rateLimitResponse = await settingsOperationRateLimiter(request, authenticatedUserId);
    if (rateLimitResponse) return rateLimitResponse;

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

    auditAccount(request, {
      action: 'payment_method.delete',
      actorType: 'dashboard',
      actorId: authenticatedUserId,
      resourceType: 'CompanyPaymentMethod',
      resourceId: methodId,
      metadata: { companyId },
    });

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (e) {
    console.error('DELETE /api/company/payment-methods/[id] error:', e);
    return NextResponse.json({ error: 'Failed to delete payment method' }, { status: 500, headers });
  }
}
