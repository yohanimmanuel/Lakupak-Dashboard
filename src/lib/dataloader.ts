import DataLoader from 'dataloader';
import { prisma } from '@/lib/db';
import type { Product, VariantOption, Offer, OfferProduct, OfferDiscountType, DateRange } from '@/generated/prisma';

/**
 * DataLoader for batching and caching database queries
 * Prevents N+1 query problems by batching multiple requests into single queries
 */

// Product DataLoader - batch load products by productId
export const createProductLoader = () => {
  return new DataLoader<string, Product | null>(
    async (productIds) => {
      const products = await prisma.product.findMany({
        where: {
          productId: { in: productIds as string[] },
        },
      });

      const productMap = new Map(products.map((p) => [p.productId, p]));
      return productIds.map((id) => productMap.get(id) || null);
    },
    {
      cache: true,
      maxBatchSize: 100,
    }
  );
};

// VariantOptions DataLoader - batch load variant options by productId (string-based)
export const createVariantOptionsLoader = () => {
  return new DataLoader<string, VariantOption[]>(
    async (productIds) => {
      // Query all variant options and filter in memory since productId is stored as string
      const allProducts = await prisma.product.findMany({
        where: {
          productId: { in: [...productIds] },
        },
        select: {
          id: true,
          productId: true,
        },
      });

      const productInternalIds = allProducts.map((p) => p.id);
      const productIdMap = new Map(allProducts.map((p) => [p.id, p.productId]));

      const variantOptions = await prisma.variantOption.findMany({
        where: {
          productId: { in: productInternalIds },
        },
      });

      const variantMap = new Map<string, VariantOption[]>();
      for (const variant of variantOptions) {
        const pid = productIdMap.get(variant.productId) || '';
        if (!variantMap.has(pid)) {
          variantMap.set(pid, []);
        }
        variantMap.get(pid)!.push(variant);
      }

      return productIds.map((id) => variantMap.get(id) || []);
    },
    {
      cache: true,
      maxBatchSize: 100,
    }
  );
};

// Offers DataLoader - batch load active offers for products
export const createActiveOffersLoader = (userId: number | number[]) => {
  return new DataLoader<string, Array<Offer & { offerProducts: OfferProduct[]; offerDiscountTypes: OfferDiscountType[]; dateRanges: DateRange[] }>>(
    async (productIds) => {
      const userIds = Array.isArray(userId) ? userId : [userId];
      
      const offers = await prisma.offer.findMany({
        where: {
          status: 'Active',
          userId: { in: userIds },
          offerProducts: {
            some: {
              productId: { in: productIds as string[] },
            },
          },
        },
        include: {
          offerProducts: true,
          offerDiscountTypes: {
            where: { isActive: true },
          },
          dateRanges: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Map offers to products
      const offerMap = new Map<string, Array<Offer & { offerProducts: OfferProduct[]; offerDiscountTypes: OfferDiscountType[]; dateRanges: DateRange[] }>>();
      
      for (const offer of offers) {
        for (const product of offer.offerProducts) {
          if (!offerMap.has(product.productId)) {
            offerMap.set(product.productId, []);
          }
          offerMap.get(product.productId)!.push(offer);
        }
      }

      return productIds.map((id) => offerMap.get(id) || []);
    },
    {
      cache: true,
      maxBatchSize: 50,
    }
  );
};

// Sold Count DataLoader - batch calculate sold counts for products
export const createSoldCountLoader = () => {
  return new DataLoader<string, string>(
    async (productIds) => {
      const orderItems = await prisma.orderItem.findMany({
        where: {
          productId: { in: [...productIds] },
          order: {
            orderStatus: { notIn: ['Cancelled', 'Refunded', 'Returned'] },
          },
        },
        select: {
          productId: true,
          packageQuantity: true,
          piecesPerPackage: true,
        },
      });

      const soldCountMap = new Map<string, number>();
      for (const item of orderItems) {
        const pid = item.productId || '';
        const count = soldCountMap.get(pid) || 0;
        soldCountMap.set(
          pid,
          count + (item.packageQuantity || 0) * (item.piecesPerPackage || 1)
        );
      }

      return productIds.map((id) => (soldCountMap.get(id) || 0).toString());
    },
    {
      cache: true,
      maxBatchSize: 100,
    }
  );
};

/**
 * Context object containing all DataLoaders
 * Create a new instance per GraphQL request to avoid caching across requests
 */
export interface DataLoaderContext {
  productLoader: ReturnType<typeof createProductLoader>;
  variantOptionsLoader: ReturnType<typeof createVariantOptionsLoader>;
  activeOffersLoader: ReturnType<typeof createActiveOffersLoader>;
  soldCountLoader: ReturnType<typeof createSoldCountLoader>;
}

export const createDataLoaders = (userId?: number | number[]): DataLoaderContext => ({
  productLoader: createProductLoader(),
  variantOptionsLoader: createVariantOptionsLoader(),
  activeOffersLoader: createActiveOffersLoader(userId || []),
  soldCountLoader: createSoldCountLoader(),
});
