import { prisma } from '@/lib/db';
import { buildMobileBuyerId } from '@/utils/buyerSync';

/**
 * Closed marketplace access.
 *
 * A retailer reaches a distributor's storefront only through that distributor's
 * referral code. Joining creates (or reuses) the distributor-scoped client row
 * `LKB-<retailer>-<distributor>`, which is the same row marketplace orders
 * already use, so the retailer shows up in the distributor's Clients list.
 * Deactivating, blocking, or suspending that client revokes access. Deleting the
 * row alone does not permanently revoke access: a later join can recreate it.
 */

const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,22}[A-Z0-9]$/;
const REVOKED_CLIENT_STATUSES = new Set(['inactive', 'blocked', 'suspended']);

type MembershipError = { error: string; code: string; status: number };

const ACCESS_REVOKED: MembershipError = {
  error: 'Your access to this storefront was revoked by the distributor. Contact them if you need access again.',
  code: 'ACCESS_REVOKED',
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

/**
 * Links the retailer to the distributor. Keeps any client details the distributor already edited.
 * Refuses to (re)join when the existing client row is inactive, blocked, or suspended.
 */
export async function ensureMarketplaceMembership(
  marketplaceUserId: number,
  distributorId: number,
): Promise<{ ok: true } | MembershipError> {
  const user = await prisma.marketplaceUser.findUnique({
    where: { id: marketplaceUserId },
    select: { name: true, email: true, phone: true, storeName: true, chosenAddress: true, image: true },
  });
  if (!user) throw new Error('Marketplace user not found');
  const buyerId = buildMobileBuyerId(marketplaceUserId, distributorId);
  const existing = await prisma.buyer.findUnique({
    where: { buyerId },
    select: { status: true },
  });
  if (existing && isRevokedClientStatus(existing.status)) {
    return ACCESS_REVOKED;
  }
  await prisma.buyer.upsert({
    where: { buyerId },
    update: {},
    create: {
      buyerId,
      owner: user.name || 'Mobile User',
      email: user.email || '',
      phone: user.phone || '',
      storeName: user.storeName || 'Mobile Store',
      businessType: 'Retailer',
      address: user.chosenAddress || '',
      avatar: user.image || null,
      status: 'Active',
      userId: distributorId,
    },
  });
  return { ok: true };
}

/** Distributors whose storefront this retailer may see. */
export async function marketplaceMemberDistributorIds(marketplaceUserId: number): Promise<number[]> {
  if (!Number.isInteger(marketplaceUserId) || marketplaceUserId < 1) return [];
  const prefix = `${buildMobileBuyerId(marketplaceUserId)}-`;
  const rows = await prisma.buyer.findMany({
    where: { buyerId: { startsWith: prefix } },
    select: { buyerId: true, userId: true, status: true },
  });
  const ids = rows
    .filter((row) => row.userId != null && row.buyerId === `${prefix}${row.userId}`)
    .filter((row) => !isRevokedClientStatus(row.status))
    .map((row) => row.userId as number);
  if (ids.length === 0) return [];
  const active = await prisma.user.findMany({
    where: { id: { in: ids }, isSuspended: false, accountStatus: 'active' },
    select: { id: true },
  });
  return active.map((row) => row.id);
}

/**
 * Validates storefront access for sign-in without writing membership.
 * Use before consuming a one-time credential (e.g. OTP) so a bad/missing code can be corrected.
 */
export async function validateJoinOrRequireMembership(
  marketplaceUserId: number,
  rawReferralCode: unknown,
): Promise<{ distributorId: number } | MembershipError> {
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
    return { distributorId: distributor.id };
  }
  const memberships = await marketplaceMemberDistributorIds(marketplaceUserId);
  if (memberships.length === 1) return { distributorId: memberships[0] };
  return {
    error: 'Enter the referral code from your distributor to open their storefront.',
    code: 'REFERRAL_CODE_REQUIRED',
    status: 403,
  };
}

/**
 * Used at sign-in. The code opens that distributor's storefront for this session.
 * Without one, the account must already belong to exactly one distributor.
 */
export async function joinOrRequireMembership(
  marketplaceUserId: number,
  rawReferralCode: unknown,
): Promise<{ distributorId: number } | MembershipError> {
  const validated = await validateJoinOrRequireMembership(marketplaceUserId, rawReferralCode);
  if ('error' in validated) return validated;
  if (normalizeReferralCode(rawReferralCode)) {
    const ensured = await ensureMarketplaceMembership(marketplaceUserId, validated.distributorId);
    if ('error' in ensured) return ensured;
  }
  return { distributorId: validated.distributorId };
}

/** The one distributor storefront this session may see. A claimed id is used only while membership still holds. */
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
