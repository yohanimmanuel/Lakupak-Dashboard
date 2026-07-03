import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { makeAuthenticatedDashboardPutRequest, resetDb } from './helpers';
import { updateOrderHandler } from '@/services/orders/updateOrder';

describe('orders update - stock deduct/restore', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('deducts stock when moving from Pending to Confirmed', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist2@example.com', password: 'x' },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-DED-1',
        sku: 'SKU-DED-1',
        name: 'Deduct Product',
        description: 'Test',
        productType: 'TestType',
        brand: 'TestBrand',
        supplier: 'TestSupplier',
        status: 'Published',
        productCategory: 'Retail',
        catalogName: 'Default',
        images: [],
        marketplaceStatus: 'Published',
        userId: distributor.id,
      },
      select: { id: true, productId: true },
    });

    const variant = await prisma.variantOption.create({
      data: {
        productId: product.id,
        variantName: 'Default',
        attributes: {},
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
      select: { id: true },
    });

    const orderId = 'LKO-10001';
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
    });

    await prisma.orderItem.create({
      data: {
        orderId,
        productId: product.productId,
        subtotal: 2000,
        packageType: 'Box',
        piecesPerPackage: 1,
        packageQuantity: 2, // deduct 2 pieces
        pricePerPackage: 1000,
        productNameSnapshot: 'Deduct Product',
        productSkuSnapshot: 'SKU-DED-1',
        productTypeSnapshot: 'TestType',
        variantOptionId: variant.id,
        variantNameSnapshot: 'Default',
        offerApplied: false,
        promotionDetailsSnapshot: null,
        moqSnapshot: 1,
      },
    });

    const res = await updateOrderHandler(
      makeAuthenticatedDashboardPutRequest('http://localhost/api/orders', {
        orderId,
        userId: distributor.id,
        orderStatus: 'Confirmed',
      }, distributor.id),
    );

    expect(res.status).toBe(200);
    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(updatedVariant?.stockQuantity).toBe(8);
  });

  it('does not change stock when moving from Confirmed to Delivered', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist5@example.com', password: 'x' },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-NOCHG-1',
        sku: 'SKU-NOCHG-1',
        name: 'No Change Product',
        description: 'Test',
        productType: 'TestType',
        brand: 'TestBrand',
        supplier: 'TestSupplier',
        status: 'Published',
        productCategory: 'Retail',
        catalogName: 'Default',
        images: [],
        marketplaceStatus: 'Published',
        userId: distributor.id,
      },
      select: { id: true, productId: true },
    });

    const variant = await prisma.variantOption.create({
      data: {
        productId: product.id,
        variantName: 'Default',
        attributes: {},
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
      select: { id: true },
    });

    const orderId = 'LKO-10003';
    await prisma.order.create({
      data: {
        orderId,
        orderDate: new Date(),
        orderStatus: 'Confirmed',
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
    });

    await prisma.orderItem.create({
      data: {
        orderId,
        productId: product.productId,
        subtotal: 2000,
        packageType: 'Box',
        piecesPerPackage: 1,
        packageQuantity: 2,
        pricePerPackage: 1000,
        productNameSnapshot: 'No Change Product',
        productSkuSnapshot: 'SKU-NOCHG-1',
        productTypeSnapshot: 'TestType',
        variantOptionId: variant.id,
        variantNameSnapshot: 'Default',
        offerApplied: false,
        promotionDetailsSnapshot: null,
        moqSnapshot: 1,
      },
    });

    const before = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(before?.stockQuantity).toBe(10);

    const res = await updateOrderHandler(
      makeAuthenticatedDashboardPutRequest('http://localhost/api/orders', {
        orderId,
        userId: distributor.id,
        orderStatus: 'Delivered',
      }, distributor.id),
    );

    expect(res.status).toBe(200);
    const after = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(after?.stockQuantity).toBe(10);
  });

  it('restores stock when moving from Confirmed to Cancelled', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist3@example.com', password: 'x' },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-RES-1',
        sku: 'SKU-RES-1',
        name: 'Restore Product',
        description: 'Test',
        productType: 'TestType',
        brand: 'TestBrand',
        supplier: 'TestSupplier',
        status: 'Published',
        productCategory: 'Retail',
        catalogName: 'Default',
        images: [],
        marketplaceStatus: 'Published',
        userId: distributor.id,
      },
      select: { id: true, productId: true },
    });

    const variant = await prisma.variantOption.create({
      data: {
        productId: product.id,
        variantName: 'Default',
        attributes: {},
        purchasePrice: 1000,
        sellingPrice: 2000,
        originalSellingPrice: 2000,
        moq: 1,
        stockQuantity: 8,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: true,
        isActive: true,
      },
      select: { id: true },
    });

    const orderId = 'LKO-10002';
    await prisma.order.create({
      data: {
        orderId,
        orderDate: new Date(),
        orderStatus: 'Confirmed',
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
    });

    await prisma.orderItem.create({
      data: {
        orderId,
        productId: product.productId,
        subtotal: 2000,
        packageType: 'Box',
        piecesPerPackage: 1,
        packageQuantity: 2, // restore 2 pieces
        pricePerPackage: 1000,
        productNameSnapshot: 'Restore Product',
        productSkuSnapshot: 'SKU-RES-1',
        productTypeSnapshot: 'TestType',
        variantOptionId: variant.id,
        variantNameSnapshot: 'Default',
        offerApplied: false,
        promotionDetailsSnapshot: null,
        moqSnapshot: 1,
      },
    });

    const res = await updateOrderHandler(
      makeAuthenticatedDashboardPutRequest('http://localhost/api/orders', {
        orderId,
        userId: distributor.id,
        orderStatus: 'Cancelled',
      }, distributor.id),
    );

    expect(res.status).toBe(200);
    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(updatedVariant?.stockQuantity).toBe(10);
  });

  it('restores stock from pre-replacement items when cancelling and rebuilding line items', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist4@example.com', password: 'x' },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-RES-REPLACE-1',
        sku: 'SKU-RES-REPLACE-1',
        name: 'Restore Replace Product',
        description: 'Test',
        productType: 'TestType',
        brand: 'TestBrand',
        supplier: 'TestSupplier',
        status: 'Published',
        productCategory: 'Retail',
        catalogName: 'Default',
        images: [],
        marketplaceStatus: 'Published',
        userId: distributor.id,
      },
      select: { id: true, productId: true },
    });

    const variant = await prisma.variantOption.create({
      data: {
        productId: product.id,
        variantName: 'Default',
        attributes: {},
        purchasePrice: 1000,
        sellingPrice: 2000,
        originalSellingPrice: 2000,
        moq: 1,
        stockQuantity: 8,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: true,
        isActive: true,
      },
      select: { id: true },
    });

    const orderId = 'LKO-10004';
    await prisma.order.create({
      data: {
        orderId,
        orderDate: new Date(),
        orderStatus: 'Confirmed',
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
    });

    await prisma.orderItem.create({
      data: {
        orderId,
        productId: product.productId,
        subtotal: 2000,
        packageType: 'Box',
        piecesPerPackage: 1,
        packageQuantity: 2,
        pricePerPackage: 1000,
        productNameSnapshot: 'Restore Replace Product',
        productSkuSnapshot: 'SKU-RES-REPLACE-1',
        productTypeSnapshot: 'TestType',
        variantOptionId: variant.id,
        variantNameSnapshot: 'Default',
        offerApplied: false,
        promotionDetailsSnapshot: null,
        moqSnapshot: 1,
      },
    });

    const res = await updateOrderHandler(
      makeAuthenticatedDashboardPutRequest('http://localhost/api/orders', {
        orderId,
        userId: distributor.id,
        orderStatus: 'Cancelled',
        orderItems: [
          {
            productId: product.productId,
            quantity: 5,
            packageQuantity: 5,
            piecesPerPackage: 1,
            pricePerPackage: 1000,
            subtotal: 5000,
            variantOptionId: variant.id,
            productName: 'Restore Replace Product',
          },
        ],
      }, distributor.id),
    );

    expect(res.status).toBe(200);
    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(updatedVariant?.stockQuantity).toBe(10);

    const updatedItem = await prisma.orderItem.findFirst({ where: { orderId } });
    expect(updatedItem?.packageQuantity).toBe(5);
  });
});

