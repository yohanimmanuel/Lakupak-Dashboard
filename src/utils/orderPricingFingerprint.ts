/** Stable signature of PO line prices — used to lock Send pricing until amounts change. */
export function buildOrderPricingFingerprint(
  items: Array<{
    id?: number | null;
    pricePerPackage?: number | string | null;
    subtotal?: number | string | null;
  }>,
): string {
  return items
    .map((item) => {
      const id = item.id ?? 0;
      const price = Number(item.pricePerPackage) || 0;
      const subtotal = Number(item.subtotal) || 0;
      return `${id}:${price}:${subtotal}`;
    })
    .sort()
    .join('|');
}
