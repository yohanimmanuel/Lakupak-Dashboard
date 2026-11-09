/** Read lastVisit from buyer logistics JSON; empty when missing, malformed, or non-string. */
export function logisticsLastVisit(buyer: { logistics?: string | null }): string {
  if (!buyer.logistics) return '';
  try {
    const parsed = JSON.parse(buyer.logistics) as { lastVisit?: string };
    return typeof parsed.lastVisit === 'string' ? parsed.lastVisit.trim() : '';
  } catch {
    return '';
  }
}
