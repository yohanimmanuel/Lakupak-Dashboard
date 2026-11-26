/**
 * Client-safe marketplace buyer id helpers (no Prisma / Node-only imports).
 */

/**
 * True for storefront membership rows (`LKB-<user>-<distributor>` / legacy mobile_user_),
 * not dashboard-created `LKB-<random>` buyers.
 */
export function isMarketplaceMembershipBuyerId(buyerId: string | null | undefined): boolean {
  if (!buyerId) return false;
  return /^LKB-\d+-\d+$/.test(buyerId) || buyerId.startsWith('mobile_user_');
}

/** Prospect that requested storefront access from the marketplace app/web. */
export function isMarketplaceAccessRequestBuyer(buyer: {
  buyerId: string;
  status?: string | null;
}): boolean {
  return (
    String(buyer.status || '').trim().toLowerCase() === 'prospect' &&
    isMarketplaceMembershipBuyerId(buyer.buyerId)
  );
}
