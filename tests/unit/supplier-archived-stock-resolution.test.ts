import { describe, expect, it } from 'vitest';
import { buildCatalogVariantIndexes, resolveSupplyRowVariant } from '@/lib/suppliers/orphanedSupplies';
import type { SupplyDetail } from '@/types/client';

const variants = buildCatalogVariantIndexes([{
  productId: 'P-1', variantOptionId: 205, variantName: 'Carton',
  sku: 'REUSED', productLabel: 'Item (Carton)', supplierName: 'Supplier',
}]);
const historical = {
  productId: 'P-1', variantOptionId: 101, variantName: 'Carton',
  sku: 'REUSED', product: 'Item (Carton)',
} as SupplyDetail;

describe('archived supplier catalog resolution', () => {
  it('does not reattach a deleted variant to a new variant sharing its SKU', () => {
    expect(resolveSupplyRowVariant(historical, variants)).toBeNull();
  });
  it('resolves a matching live variant by explicit identity', () => {
    expect(resolveSupplyRowVariant({ ...historical, variantOptionId: 205 }, variants)?.variantOptionId).toBe(205);
  });
});
