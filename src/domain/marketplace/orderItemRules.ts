import { parsePrice } from '@/utils/currencyUtils';
import { calculateOrderItemPromotion } from '@/utils/promotionUtils';

export type VariantOptionLike = {
  id: number;
  sellingPrice?: unknown;
  moq?: number | null;
  attributes?: unknown;
};

export type ProductWithVariantOptions<TVariant extends VariantOptionLike = VariantOptionLike> = {
  variantOptions?: TVariant[] | null;
};

export function selectVariantOption<TVariant extends VariantOptionLike>(
  product: ProductWithVariantOptions<TVariant>,
  input: { variantOptionId?: number | null; variantId?: number | null } | null | undefined,
): TVariant | null {
  const variantOptions = product.variantOptions || [];
  if (variantOptions.length === 0) return null;

  const variantOptionId = input?.variantOptionId ?? null;
  const variantId = input?.variantId ?? null;

  return (
    (variantOptionId ? variantOptions.find((vo) => vo.id === variantOptionId) : null) ||
    (variantId ? variantOptions.find((vo) => vo.id === variantId) : null) ||
    variantOptions[0] ||
    null
  );
}

export function getUnitPriceFromVariantOption(variantOption: VariantOptionLike): number {
  const raw = (variantOption as { sellingPrice?: unknown }).sellingPrice;
  if (raw === null || raw === undefined) return 0;
  return typeof raw === 'number' ? raw : parsePrice(String(raw));
}

export function computePieces(order: { packageQuantity: number; piecesPerPackage: number }) {
  const packageQuantity = Math.max(0, Number(order.packageQuantity || 0));
  const piecesPerPackage = Math.max(0, Number(order.piecesPerPackage || 0));
  const orderedPieces = packageQuantity * piecesPerPackage;
  return { orderedPieces, packageQuantity, piecesPerPackage };
}

export function computeTotalQtyNeededWithBuyXGetY(input: {
  packageQuantity: number;
  piecesPerPackage: number;
  moqPieces: number | null | undefined;
  promotionDetails:
    | { minQuantity: number; freeQuantity: number; description?: string }
    | string
    | null
    | undefined;
}) {
  const { orderedPieces } = computePieces({
    packageQuantity: input.packageQuantity,
    piecesPerPackage: input.piecesPerPackage,
  });

  const gift = calculateOrderItemPromotion(
    input.promotionDetails,
    input.packageQuantity,
    input.piecesPerPackage,
    input.moqPieces ?? null,
  );

  const freePieces = gift?.freeQty && gift.freeQty > 0 ? gift.freeQty : 0;
  const totalQtyNeeded = orderedPieces + freePieces;

  return { orderedPieces, freePieces, totalQtyNeeded };
}

