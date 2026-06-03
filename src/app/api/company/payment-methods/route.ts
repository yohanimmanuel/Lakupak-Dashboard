import { NextRequest, NextResponse } from 'next/server';
import type { CompanyPaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { getSecurityHeaders } from '@/utils/auth-security';
import {
  isPlainObject,
  parseKind,
  parsePositiveInt,
  readOptionalInt,
  readOptionalTrimmedString,
  readOptionalTrimmedStringOrNull,
  lastDigitsFromAccountInput,
  type CompanyPaymentMethodResponseJson,
} from './paymentMethodRouteTypes';
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

export async function GET(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401, headers });
    }

    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const parsedUserId = userIdParam ? parsePositiveInt(userIdParam) : null;

    if (parsedUserId === null) {
      return NextResponse.json({ error: 'Valid user ID is required' }, { status: 400, headers });
    }

    if (authenticatedUserId !== parsedUserId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers });
    }

    const companyId = await resolveCompanyIdForUser(parsedUserId);
    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers });
    }

    const rows = await prisma.companyPaymentMethod.findMany({
      where: { companyId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    const payload: CompanyPaymentMethodResponseJson[] = rows.map(serializePaymentMethod);
    return NextResponse.json(payload, { status: 200, headers });
  } catch (e) {
    console.error('GET /api/company/payment-methods error:', e);
    return NextResponse.json({ error: 'Failed to load payment methods' }, { status: 500, headers });
  }
}

export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401, headers });
    }

    const rateLimitResponse = await settingsOperationRateLimiter(request, authenticatedUserId);
    if (rateLimitResponse) return rateLimitResponse;

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

    const companyId = await resolveCompanyIdForUser(userId);
    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers });
    }

    const kind = parseKind(body.kind);
    if (!kind) {
      return NextResponse.json({ error: 'Invalid payment method kind' }, { status: 400, headers });
    }

    const labelRaw = readOptionalTrimmedString(body.label);
    if (!labelRaw) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400, headers });
    }

    const cardNumberInput = readOptionalTrimmedString(body.cardNumber);
    let last4 = readOptionalTrimmedStringOrNull(body.last4) ?? null;
    if (cardNumberInput) {
      last4 = lastDigitsFromAccountInput(cardNumberInput, 4);
    }
    const expiryMonth = readOptionalInt(body.expiryMonth);
    const expiryYear = readOptionalInt(body.expiryYear);
    const bankName = readOptionalTrimmedStringOrNull(body.bankName) ?? null;
    const accountHolderName = readOptionalTrimmedStringOrNull(body.accountHolderName) ?? null;
    const ewalletProvider = readOptionalTrimmedStringOrNull(body.ewalletProvider) ?? null;

    let accountNumberLast4: string | null = readOptionalTrimmedStringOrNull(body.accountNumberLast4) ?? null;
    const accountNumberInput = readOptionalTrimmedString(body.accountNumber);
    if (accountNumberInput && !accountNumberLast4) {
      accountNumberLast4 = lastDigitsFromAccountInput(accountNumberInput, 4);
    }

    const isDefault = body.isDefault === true;

    if (kind === 'CARD') {
      if (!last4 || last4.length < 4) {
        return NextResponse.json(
          { error: 'Enter the full card number (at least 4 digits). Only the last 4 digits are stored.' },
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
    if (kind === 'EWALLET') {
      if (!ewalletProvider) {
        return NextResponse.json({ error: 'E-wallet provider is required' }, { status: 400, headers });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.companyPaymentMethod.updateMany({
          where: { companyId },
          data: { isDefault: false },
        });
      }

      return tx.companyPaymentMethod.create({
        data: {
          companyId,
          kind,
          label: labelRaw,
          last4,
          expiryMonth: expiryMonth ?? null,
          expiryYear: expiryYear ?? null,
          bankName,
          accountHolderName,
          accountNumberLast4,
          ewalletProvider,
          isDefault,
          status: 'ACTIVE',
        },
      });
    });

    try {
      await broadcastProductUpdatesForCompanyId(companyId);
    } catch (broadcastErr) {
      console.error('Failed to broadcast product updates:', broadcastErr);
      // Non-critical: payment method was created successfully
    }

    auditAccount(request, {
      action: 'payment_method.create',
      actorType: 'dashboard',
      actorId: authenticatedUserId,
      resourceType: 'CompanyPaymentMethod',
      resourceId: String(created.id),
      metadata: { companyId, kind, isDefault },
    });

    return NextResponse.json(serializePaymentMethod(created), { status: 201, headers });
  } catch (e) {
    console.error('POST /api/company/payment-methods error:', e);
    return NextResponse.json({ error: 'Failed to create payment method' }, { status: 500, headers });
  }
}
