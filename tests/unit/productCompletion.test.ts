import { describe, expect, it } from 'vitest';
import {
  getProductCompletion,
  isProductMarketplacePublishable,
  type ProductLike,
  type CombinationLike,
} from '@/utils/productCompletion';

const baseProduct: ProductLike = {
  sku: 'TEST-SKU-1',
  name: 'Test Product',
  description: 'A complete test product description',
  productType: 'Food & Beverages',
  brand: 'BrandA',
  supplier: 'SupplierA',
  images: ['https://example.com/img1.jpg'],
};

describe('productCompletion', () => {
  describe('variantOptions mode (ProductTable)', () => {
    it('marks product complete and marketplace publishable when all variants have positive stock and valid pricing', () => {
      const product: ProductLike = {
        ...baseProduct,
        variantOptions: [
          {
            purchasePrice: '1000',
            sellingPrice: '2000',
            stockQuantity: 10,
            isActive: true,
          },
          {
            purchasePrice: '1500',
            sellingPrice: '2500',
            stockQuantity: 5,
            isActive: true,
          },
        ],
      };

      const completion = getProductCompletion(product, undefined, 'IDR', {
        requirePositiveStock: true,
        requirePositivePrice: true,
      });

      expect(completion.isComplete).toBe(true);
      expect(completion.fields.find((f) => f.key === 'stock')?.isComplete).toBe(true);
      expect(completion.fields.find((f) => f.key === 'variants')?.isComplete).toBe(true);
      expect(isProductMarketplacePublishable(product, 'IDR')).toBe(true);
    });

    it('rejects stock completion when one variant has missing stock even if aggregate stock is positive', () => {
      const productWithMissingStockOnOneVariant: ProductLike = {
        ...baseProduct,
        variantOptions: [
          {
            purchasePrice: '1000',
            sellingPrice: '2000',
            stockQuantity: 15, // positive stock
            isActive: true,
          },
          {
            purchasePrice: '1500',
            sellingPrice: '2500',
            stockQuantity: undefined as unknown as number, // missing stock
            isActive: true,
          },
        ],
      };

      // In marketplace publishing path (requirePositiveStock: true)
      const marketplaceCompletion = getProductCompletion(
        productWithMissingStockOnOneVariant,
        undefined,
        'IDR',
        { requirePositiveStock: true, requirePositivePrice: true },
      );

      expect(marketplaceCompletion.fields.find((f) => f.key === 'stock')?.isComplete).toBe(false);
      expect(marketplaceCompletion.missingFieldKeys).toContain('stock');
      expect(marketplaceCompletion.isComplete).toBe(false);
      expect(isProductMarketplacePublishable(productWithMissingStockOnOneVariant, 'IDR')).toBe(false);

      // In draft catalog path (requirePositiveStock: false)
      const draftCompletion = getProductCompletion(
        productWithMissingStockOnOneVariant,
        undefined,
        'IDR',
        { requirePositiveStock: false },
      );
      expect(draftCompletion.fields.find((f) => f.key === 'stock')?.isComplete).toBe(false);
      expect(draftCompletion.missingFieldKeys).toContain('stock');
    });

    it('rejects stock completion when a variant has null stock even if aggregate stock is positive', () => {
      const productWithNullStockOnOneVariant: ProductLike = {
        ...baseProduct,
        variantOptions: [
          {
            purchasePrice: '1000',
            sellingPrice: '2000',
            stockQuantity: 20,
            isActive: true,
          },
          {
            purchasePrice: '1500',
            sellingPrice: '2500',
            stockQuantity: null,
            isActive: true,
          },
        ],
      };

      const completion = getProductCompletion(productWithNullStockOnOneVariant, undefined, 'IDR', {
        requirePositiveStock: true,
      });

      expect(completion.fields.find((f) => f.key === 'stock')?.isComplete).toBe(false);
      expect(completion.missingFieldKeys).toContain('stock');
      expect(isProductMarketplacePublishable(productWithNullStockOnOneVariant, 'IDR')).toBe(false);
    });

    it('allows 0 stock in draft catalog path but rejects in marketplace publishable path', () => {
      const zeroStockProduct: ProductLike = {
        ...baseProduct,
        variantOptions: [
          {
            purchasePrice: '1000',
            sellingPrice: '2000',
            stockQuantity: 0,
            isActive: true,
          },
        ],
      };

      const draftCompletion = getProductCompletion(zeroStockProduct, undefined, 'IDR', {
        requirePositiveStock: false,
      });
      expect(draftCompletion.fields.find((f) => f.key === 'stock')?.isComplete).toBe(true);

      const marketplaceCompletion = getProductCompletion(zeroStockProduct, undefined, 'IDR', {
        requirePositiveStock: true,
      });
      expect(marketplaceCompletion.fields.find((f) => f.key === 'stock')?.isComplete).toBe(false);
      expect(isProductMarketplacePublishable(zeroStockProduct, 'IDR')).toBe(false);
    });
  });

  describe('combinations matrix mode (ProductCatalog)', () => {
    it('rejects stock completion when one combination has missing stock even if total stock is positive', () => {
      const combinations: CombinationLike[] = [
        {
          purchasePrice: '1000',
          sellingPrice: '2000',
          stockQuantity: 10,
        },
        {
          purchasePrice: '1500',
          sellingPrice: '2500',
          stockQuantity: '', // empty / missing stock
        },
      ];

      const completion = getProductCompletion(baseProduct, combinations, 'IDR', {
        requirePositiveStock: true,
      });

      expect(completion.fields.find((f) => f.key === 'stock')?.isComplete).toBe(false);
      expect(completion.missingFieldKeys).toContain('stock');
    });

    it('accepts stock completion when all combinations have defined valid stock and total > 0', () => {
      const combinations: CombinationLike[] = [
        {
          purchasePrice: '1000',
          sellingPrice: '2000',
          stockQuantity: 10,
        },
        {
          purchasePrice: '1500',
          sellingPrice: '2500',
          stockQuantity: 0,
        },
      ];

      const completion = getProductCompletion(baseProduct, combinations, 'IDR', {
        requirePositiveStock: true,
      });

      expect(completion.fields.find((f) => f.key === 'stock')?.isComplete).toBe(true);
    });
  });
});
