import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { resetDb } from './helpers';
import { productsResolvers } from '@/app/api/graphql/modules/products';

describe('products.variantOptionUsage (integration)', () => {
  type VariantOptionUsage = {
    variantName: string;
    orderItemCount: number;
    orderIds: string[];
  };

  beforeEach(async () => {
    await resetDb();
  });

  it('returns usage for the specific variant option ids only', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist_variant_usage_1@example.com', password: 'x' },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-VAR-USAGE-1',
        sku: 'SKU-VAR-USAGE-1',
        name: 'Variant Usage Product',
        description: 'Test',
        productType: 'TestType',
        brand: 'TestBrand',
        supplier: 'TestSupplier',
        status: 'Draft',
        productCategory: 'Retail',
        catalogName: 'Default',
        images: [],
        marketplaceStatus: 'Draft',
        userId: distributor.id,
      },
      select: { id: true, productId: true },
    });

    const used = await prisma.variantOption.create({
      data: {
        productId: product.id,
        variantName: 'Color: Brown-White Fossil',
        attributes: { Color: 'Brown-White Fossil' },
        purchasePrice: 1000,
        sellingPrice: 2000,
        originalSellingPrice: 2000,
        moq: 1,
        stockQuantity: 10,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: true,
        isActive: true,
      },
      select: { id: true, variantName: true },
    });

    const unused = await prisma.variantOption.create({
      data: {
        productId: product.id,
        variantName: 'Color: Black',
        attributes: { Color: 'Black' },
        purchasePrice: 1000,
        sellingPrice: 2000,
        originalSellingPrice: 2000,
        moq: 1,
        stockQuantity: 10,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: false,
        isActive: true,
      },
      select: { id: true, variantName: true },
    });

    const orderId = 'LKO-VAR-USAGE-1';
    await prisma.order.create({
      data: {
        orderId,
        orderDate: new Date(),
        orderStatus: 'Pending',
        paymentStatus: 'Unpaid',
        deliveryMethod: 'Seller/Distributor Delivery',
        deliveryOption: null,
        subtotal: 2000,
        discounts: 0,
        shippingFee: 0,
        totalAmount: 2000,
        paymentTerms: 'Cash on Delivery',
        totalOrders: 1,
        contactPerson: 'Tester',
        storeName: 'Test Store',
        contactPhone: '123',
        customerEmail: null,
        deliveryAddress: 'Addr',
        preferredDeliveryDate: null,
        preferredDeliveryTime: null,
        preferredPickupDate: null,
        preferredPickupTime: null,
        shippingMethodLabel: null,
        shippingMethod: null,
        userId: distributor.id,
        buyerId: null,
        buyerIdSnapshot: null,
        contactPersonSnapshot: null,
        contactPhoneSnapshot: null,
        customerEmailSnapshot: null,
        deliveryAddressSnapshot: null,
        orderDateSnapshot: null,
        storeNameSnapshot: null,
      },
      select: { orderId: true },
    });

    await prisma.orderItem.create({
      data: {
        orderId,
        productId: product.productId,
        subtotal: 2000,
        packageType: 'Box',
        piecesPerPackage: 1,
        packageQuantity: 1,
        pricePerPackage: 2000,
        productNameSnapshot: 'Variant Usage Product',
        productSkuSnapshot: 'SKU-VAR-USAGE-1',
        productTypeSnapshot: 'TestType',
        variantOptionId: used.id,
        variantNameSnapshot: used.variantName,
        offerApplied: false,
        promotionDetailsSnapshot: null,
        moqSnapshot: 1,
      },
    });

    const dashboardCtx = { user: { id: distributor.id, type: 'dashboard' as const } };

    const res = await productsResolvers.Query.variantOptionUsage(null as never, {
      userId: distributor.id,
      productId: product.productId,
      variantOptionIds: [used.id, unused.id],
      variantNames: null,
    }, dashboardCtx);

    const resTyped = res as VariantOptionUsage[];
    const byName = new Map(resTyped.map((r) => [r.variantName, r]));
    expect(byName.get(used.variantName)?.orderItemCount).toBe(1);
    expect(byName.get(unused.variantName)?.orderItemCount).toBe(0);
  });

  it('still reports usage by ids even if variantName changes (e.g. after adding a new layer)', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist_variant_usage_2@example.com', password: 'x' },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-VAR-USAGE-2',
        sku: 'SKU-VAR-USAGE-2',
        name: 'Variant Usage Product 2',
        description: 'Test',
        productType: 'TestType',
        brand: 'TestBrand',
        supplier: 'TestSupplier',
        status: 'Draft',
        productCategory: 'Retail',
        catalogName: 'Default',
        images: [],
        marketplaceStatus: 'Draft',
        userId: distributor.id,
      },
      select: { id: true, productId: true },
    });

    const opt = await prisma.variantOption.create({
      data: {
        productId: product.id,
        variantName: 'Color: Red',
        attributes: { Color: 'Red' },
        purchasePrice: 1000,
        sellingPrice: 2000,
        originalSellingPrice: 2000,
        moq: 1,
        stockQuantity: 10,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: true,
        isActive: true,
      },
      select: { id: true, variantName: true },
    });

    const orderId = 'LKO-VAR-USAGE-2';
    await prisma.order.create({
      data: {
        orderId,
        orderDate: new Date(),
        orderStatus: 'Pending',
        paymentStatus: 'Unpaid',
        deliveryMethod: 'Seller/Distributor Delivery',
        deliveryOption: null,
        subtotal: 2000,
        discounts: 0,
        shippingFee: 0,
        totalAmount: 2000,
        paymentTerms: 'Cash on Delivery',
        totalOrders: 1,
        contactPerson: 'Tester',
        storeName: 'Test Store',
        contactPhone: '123',
        customerEmail: null,
        deliveryAddress: 'Addr',
        preferredDeliveryDate: null,
        preferredDeliveryTime: null,
        preferredPickupDate: null,
        preferredPickupTime: null,
        shippingMethodLabel: null,
        shippingMethod: null,
        userId: distributor.id,
        buyerId: null,
        buyerIdSnapshot: null,
        contactPersonSnapshot: null,
        contactPhoneSnapshot: null,
        customerEmailSnapshot: null,
        deliveryAddressSnapshot: null,
        orderDateSnapshot: null,
        storeNameSnapshot: null,
      },
      select: { orderId: true },
    });

    await prisma.orderItem.create({
      data: {
        orderId,
        productId: product.productId,
        subtotal: 2000,
        packageType: 'Box',
        piecesPerPackage: 1,
        packageQuantity: 1,
        pricePerPackage: 2000,
        productNameSnapshot: 'Variant Usage Product 2',
        productSkuSnapshot: 'SKU-VAR-USAGE-2',
        productTypeSnapshot: 'TestType',
        variantOptionId: opt.id,
        variantNameSnapshot: opt.variantName,
        offerApplied: false,
        promotionDetailsSnapshot: null,
        moqSnapshot: 1,
      },
    });

    // Simulate variant layer changes that rewrite names (but orderItems keep variantOptionId).
    const renamed = await prisma.variantOption.update({
      where: { id: opt.id },
      data: {
        variantName: 'Color: Red | Size: M',
        attributes: { Color: 'Red', Size: 'M' },
      },
      select: { id: true, variantName: true },
    });

    const res = await productsResolvers.Query.variantOptionUsage(null as never, {
      userId: distributor.id,
      productId: product.productId,
      variantOptionIds: [renamed.id],
      variantNames: null,
    }, { user: { id: distributor.id, type: 'dashboard' as const } });

    expect(res).toHaveLength(1);
    expect(res[0].variantName).toBe(renamed.variantName);
    expect(res[0].orderItemCount).toBe(1);
    expect(res[0].orderIds).toEqual([orderId]);
  });
});

