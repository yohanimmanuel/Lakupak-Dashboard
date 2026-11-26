import { prisma } from '@/lib/db';
import { buildMobileBuyerId, parseMarketplaceUserIdFromBuyerId } from '@/utils/buyerSync';
import { isMarketplaceMembershipBuyerId } from '@/utils/marketplaceBuyerId';

/**
 * Closed marketplace access.
 *
 * A retailer reaches a distributor's storefront through that distributor's
 * referral code. Joining creates (or reuses) `LKB-<retailer>-<distributor>` as a
 * Prospect in the distributor's Clients list. Storefront access is granted only
 * after the distributor approves the client (typically Active + market segment).
 * Deactivating, blocking, or suspending that client revokes access.
 */

const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,22}[A-Z0-9]$/;
const REVOKED_CLIENT_STATUSES = new Set(['inactive', 'blocked', 'suspended']);

type MembershipError = { error: string; code: string; status: number };

export type MembershipOk = {
  distributorId: number;
  /** active = storefront open; pending = Prospect awaiting distributor approval */
  access: 'active' | 'pending';
};

const ACCESS_REVOKED: MembershipError = {
  error: 'Your access to this storefront was revoked by the distributor. Contact them if you need access again.',
  code: 'ACCESS_REVOKED',
  status: 403,
};

const MEMBERSHIP_PENDING: MembershipError = {
  error: 'Your access request is waiting for distributor approval. You will see their products after they approve you.',
  code: 'MEMBERSHIP_PENDING',
  status: 403,
};

export function normalizeReferralCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase().replace(/\s+/g, '') : '';
}

/** 4 to 24 letters, digits, or dashes; starts and ends with a letter or digit. */
export function isValidReferralCodeFormat(code: string): boolean {
  return REFERRAL_CODE_PATTERN.test(code);
}

function isRevokedClientStatus(status: string | null | undefined): boolean {
  return REVOKED_CLIENT_STATUSES.has(String(status || '').toLowerCase());
}

function isProspectStatus(status: string | null | undefined): boolean {
  return String(status || '').trim().toLowerCase() === 'prospect';
}

function isActiveStatus(status: string | null | undefined): boolean {
  return String(status || '').trim().toLowerCase() === 'active';
}

export async function findDistributorByReferralCode(raw: unknown) {
  const code = normalizeReferralCode(raw);
  if (!isValidReferralCodeFormat(code)) return null;
  const distributor = await prisma.user.findUnique({
    where: { marketplaceReferralCode: code },
    select: { id: true, isSuspended: true, accountStatus: true },
  });
  if (!distributor || distributor.isSuspended || distributor.accountStatus !== 'active') return null;
  return { id: distributor.id };
}

type MembershipRow = {
  buyerId: string;
  userId: number | null;
  status: string;
};

async function listScopedMembershipRows(marketplaceUserId: number): Promise<MembershipRow[]> {
  if (!Number.isInteger(marketplaceUserId) || marketplaceUserId < 1) return [];
  const prefix = `${buildMobileBuyerId(marketplaceUserId)}-`;
  const rows = await prisma.buyer.findMany({
    where: { buyerId: { startsWith: prefix } },
    select: { buyerId: true, userId: true, status: true },
  });
  return rows.filter(
    (row) => row.userId != null && row.buyerId === `${prefix}${row.userId}`,
  ) as MembershipRow[];
}

/**
 * Links the retailer to the distributor as a Prospect access request.
 * Keeps distributor edits on an existing row. Does not grant storefront access
 * until status is Active.
 */
export async function ensureMarketplaceMembership(
  marketplaceUserId: number,
  distributorId: number,
): Promise<{ ok: true; access: 'active' | 'pending' } | MembershipError> {
  const user = await prisma.marketplaceUser.findUnique({
    where: { id: marketplaceUserId },
    select: { name: true, email: true, phone: true, storeName: true, chosenAddress: true, image: true },
  });
  if (!user) throw new Error('Marketplace user not found');
  const buyerId = buildMobileBuyerId(marketplaceUserId, distributorId);
  const existing = await prisma.buyer.findUnique({
    where: { buyerId },
    select: { status: true, businessType: true },
  });
  if (existing && isRevokedClientStatus(existing.status)) {
    return ACCESS_REVOKED;
  }

  // Drop legacy default "Retailer" so CRM segment can fill on merge without wiping prices.
  if (
    existing &&
    String(existing.businessType || '').trim().toLowerCase() === 'retailer'
  ) {
    await prisma.buyer.update({
      where: { buyerId },
      data: { businessType: '' },
    });
  }

  if (!existing) {
    const storeName = user.storeName || 'Mobile Store';
    await prisma.buyer.create({
      data: {
        buyerId,
        owner: user.name || 'Mobile User',
        email: user.email || '',
        phone: user.phone || '',
        storeName,
        // Distributor sets market segment before approval.
        businessType: '',
        address: user.chosenAddress || '',
        avatar: user.image || null,
        status: 'Prospect',
        userId: distributorId,
        notes: JSON.stringify(['Marketplace access request']),
      },
    });

    try {
      const { NotificationService } = await import('@/app/api/graphql/modules/notifications');
      await NotificationService.createMarketplaceAccessRequestNotification(
        distributorId,
        buyerId,
        storeName,
      );
    } catch {
      // Never block membership on notification failure.
    }

    return { ok: true, access: 'pending' };
  }

  // Existing Active stays Active; Prospect stays Prospect. Never invent Active here.
  return {
    ok: true,
    access: isActiveStatus(existing.status) ? 'active' : 'pending',
  };
}

/** Distributors whose storefront this retailer may see (Active membership only). */
export async function marketplaceMemberDistributorIds(marketplaceUserId: number): Promise<number[]> {
  const rows = await listScopedMembershipRows(marketplaceUserId);
  const ids = rows
    .filter((row) => isActiveStatus(row.status))
    .map((row) => row.userId as number);
  if (ids.length === 0) return [];
  const active = await prisma.user.findMany({
    where: { id: { in: ids }, isSuspended: false, accountStatus: 'active' },
    select: { id: true },
  });
  return active.map((row) => row.id);
}

/** Distributors where this retailer has a Prospect access request. */
export async function marketplacePendingDistributorIds(marketplaceUserId: number): Promise<number[]> {
  const rows = await listScopedMembershipRows(marketplaceUserId);
  const ids = rows
    .filter((row) => isProspectStatus(row.status))
    .map((row) => row.userId as number);
  if (ids.length === 0) return [];
  const active = await prisma.user.findMany({
    where: { id: { in: ids }, isSuspended: false, accountStatus: 'active' },
    select: { id: true },
  });
  return active.map((row) => row.id);
}

export async function getMembershipAccess(
  marketplaceUserId: number,
  distributorId: number,
): Promise<'active' | 'pending' | 'revoked' | 'none'> {
  const buyerId = buildMobileBuyerId(marketplaceUserId, distributorId);
  const row = await prisma.buyer.findUnique({
    where: { buyerId },
    select: { status: true, userId: true },
  });
  if (!row || row.userId !== distributorId) return 'none';
  if (isRevokedClientStatus(row.status)) return 'revoked';
  if (isActiveStatus(row.status)) return 'active';
  if (isProspectStatus(row.status)) return 'pending';
  return 'none';
}

/**
 * Validates storefront join for sign-in without writing membership.
 * Use before consuming a one-time credential (e.g. OTP).
 */
export async function validateJoinOrRequireMembership(
  marketplaceUserId: number,
  rawReferralCode: unknown,
): Promise<{ distributorId: number; accessHint?: 'active' | 'pending' } | MembershipError> {
  if (normalizeReferralCode(rawReferralCode)) {
    const distributor = await findDistributorByReferralCode(rawReferralCode);
    if (!distributor) {
      return {
        error: 'This referral code is not valid. Check it with your distributor.',
        code: 'REFERRAL_CODE_INVALID',
        status: 400,
      };
    }
    const buyerId = buildMobileBuyerId(marketplaceUserId, distributor.id);
    const existing = await prisma.buyer.findUnique({
      where: { buyerId },
      select: { status: true },
    });
    if (existing && isRevokedClientStatus(existing.status)) {
      return ACCESS_REVOKED;
    }
    return {
      distributorId: distributor.id,
      accessHint: existing && isActiveStatus(existing.status) ? 'active' : 'pending',
    };
  }

  const active = await marketplaceMemberDistributorIds(marketplaceUserId);
  if (active.length === 1) return { distributorId: active[0], accessHint: 'active' };

  const pending = await marketplacePendingDistributorIds(marketplaceUserId);
  if (pending.length === 1) return { distributorId: pending[0], accessHint: 'pending' };

  return {
    error: 'Enter the referral code from your distributor to open their storefront.',
    code: 'REFERRAL_CODE_REQUIRED',
    status: 403,
  };
}

/**
 * Used at sign-in / register. Referral creates a Prospect access request when new.
 * Returns access so clients can show a pending-approval state.
 */
export async function joinOrRequireMembership(
  marketplaceUserId: number,
  rawReferralCode: unknown,
): Promise<MembershipOk | MembershipError> {
  const validated = await validateJoinOrRequireMembership(marketplaceUserId, rawReferralCode);
  if ('error' in validated) return validated;

  if (normalizeReferralCode(rawReferralCode)) {
    const ensured = await ensureMarketplaceMembership(marketplaceUserId, validated.distributorId);
    if ('error' in ensured) return ensured;
    return { distributorId: validated.distributorId, access: ensured.access };
  }

  const access = await getMembershipAccess(marketplaceUserId, validated.distributorId);
  if (access === 'revoked') return ACCESS_REVOKED;
  if (access === 'active') return { distributorId: validated.distributorId, access: 'active' };
  if (access === 'pending') return { distributorId: validated.distributorId, access: 'pending' };
  return MEMBERSHIP_PENDING;
}

/** The one distributor storefront this session may see (Active only). */
export async function activeStorefrontDistributorId(
  marketplaceUserId: number,
  claimedDistributorId?: number | null,
): Promise<number | null> {
  const members = await marketplaceMemberDistributorIds(marketplaceUserId);
  if (
    typeof claimedDistributorId === 'number' &&
    Number.isInteger(claimedDistributorId) &&
    members.includes(claimedDistributorId)
  ) {
    return claimedDistributorId;
  }
  return members.length === 1 ? members[0] : null;
}

export async function isMarketplaceMember(marketplaceUserId: number, distributorId: number): Promise<boolean> {
  if (!Number.isInteger(distributorId) || distributorId < 1) return false;
  return (await marketplaceMemberDistributorIds(marketplaceUserId)).includes(distributorId);
}

/**
 * Approve a marketplace access Prospect: requires market segment, then Active.
 * `buyerId` is the CRM / membership id (usually LKB-<user>-<distributor>).
 */
export async function approveMarketplaceAccessRequest(opts: {
  distributorId: number;
  buyerId: string;
  businessType: string;
}): Promise<{ ok: true; buyerId: string } | { error: string; code: string }> {
  const businessType = String(opts.businessType || '').trim();
  if (!businessType) {
    return {
      error: 'Set a market segment (business type) before approving access.',
      code: 'BUSINESS_TYPE_REQUIRED',
    };
  }

  if (!isMarketplaceMembershipBuyerId(opts.buyerId)) {
    return {
      error: 'Only marketplace access requests can be approved here.',
      code: 'NOT_MARKETPLACE_ACCESS_REQUEST',
    };
  }

  const buyer = await prisma.buyer.findFirst({
    where: { buyerId: opts.buyerId, userId: opts.distributorId },
    select: { buyerId: true, status: true, notes: true },
  });
  if (!buyer) {
    return { error: 'Buyer not found', code: 'BUYER_NOT_FOUND' };
  }
  if (!isProspectStatus(buyer.status)) {
    return { error: 'This client is not awaiting marketplace access approval.', code: 'NOT_PENDING_ACCESS' };
  }
  if (isRevokedClientStatus(buyer.status)) {
    return { error: 'Reactivate this client before approving marketplace access.', code: 'BUYER_REVOKED' };
  }

  let nextNotes: string | null = buyer.notes;
  if (buyer.notes) {
    try {
      const parsed: unknown = JSON.parse(buyer.notes);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(
          (item) =>
            typeof item === 'string' &&
            item.trim().toLowerCase() !== 'marketplace access request',
        );
        nextNotes = filtered.length > 0 ? JSON.stringify(filtered) : null;
      }
    } catch {
      // keep original notes
    }
  }

  await prisma.buyer.update({
    where: { buyerId: buyer.buyerId },
    data: {
      businessType,
      status: 'Active',
      notes: nextNotes,
    },
  });

  const marketplaceUserId = parseMarketplaceUserIdFromBuyerId(buyer.buyerId);
  if (marketplaceUserId != null) {
    try {
      const { translateMarketplaceMembershipApproved } = await import(
        '@/utils/marketplacePushTranslations'
      );
      const { sendExpoPushToMarketplaceUser } = await import('@/utils/expoPush');
      const { broadcastNotification } = await import('@/utils/websocketBroadcast');
      const translations = translateMarketplaceMembershipApproved();
      const payload = {
        type: 'membership_approved',
        actionPath: '/(tabs)/home',
      };
      await sendExpoPushToMarketplaceUser(marketplaceUserId, translations, payload);
      // Always WS so an open app can clear the pending Alerts row immediately.
      await broadcastNotification(
        'membership_approved',
        translations.en.title,
        translations.en.body,
        payload,
        marketplaceUserId,
        'marketplace',
      );
    } catch {
      // Never block approval on buyer notify failure.
    }
  }

  return { ok: true, buyerId: buyer.buyerId };
}
