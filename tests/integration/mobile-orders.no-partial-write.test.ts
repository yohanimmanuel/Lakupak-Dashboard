import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { createMobileMarketplaceOrders } from '@/services/mobileOrders/mobileOrdersService';
import { NextRequest } from 'next/server';
import { resetDb } from './helpers';

function makeNextRequest(url: string, body: unknown) {
  const req = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    body: JSON.stringify(body),
  });
  return new NextRequest(req);
}

describe('mobile orders - fail fast without partial writes', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns 400 and creates no order when stock is insufficient', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist4@example.com', password: 'x' },
      select: { id: true },
    });

    const buyer = await prisma.marketplaceUser.create({
      data: {
        username: 'buyer2',
        phone: '+620000000002',
        email: 'buyer2@example.com',
        name: 'Buyer Two',
        storeName: 'Buyer Store',
        chosenAddress: 'Address',
      },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-LOW-1',
        sku: 'SKU-LOW-1',
        name: 'Low Stock Product',
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
      select: { id: true, productId: true, name: true },
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
        stockQuantity: 1,
        lowStockThreshold: 0,
        stockStatus: 'In Stock',
        isDefault: true,
        isActive: true,
      },
      select: { id: true },
    });

    const res = await createMobileMarketplaceOrders(
      makeNextRequest('http://localhost/api/mobile/orders', {
        orderId: 'O-LOW-1',
        orderDate: new Date().toISOString(),
        orderItems: [
          {
            productId: product.productId,
            quantity: 1,
            priceAtPurchase: '2000',
            subtotal: '2000',
            packageQuantity: 2, // need 2 pieces, only 1 in stock
            piecesPerPackage: 1,
            productName: product.name,
            productSku: 'SKU-LOW-1',
            variantId: variant.id,
            category: 'TestType',
          },
        ],
        discounts: 0,
        shippingFee: 0,
        contactPerson: 'Buyer',
        storeName: 'Buyer Store',
        contactPhone: '+620000000002',
        customerEmail: 'buyer2@example.com',
        deliveryAddress: 'Address',
        deliveryMethod: 'Seller/Distributor Delivery',
        deliveryOption: null,
        orderStatus: 'Pending',
        paymentStatus: 'Unpaid',
        paymentTerms: 'Cash on Delivery',
        preferredDeliveryDate: null,
        preferredDeliveryTime: null,
        preferredPickupDate: null,
        preferredPickupTime: null,
        shippingMethodLabel: null,
        shippingMethod: null,
        estimatedDeliveryMinDays: null,
        estimatedDeliveryMaxDays: null,
        userId: buyer.id,
      }),
      buyer.id,
    );

    expect(res.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);

    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(updatedVariant?.stockQuantity).toBe(1);
  });

  it('reserves ordered + free pieces for buy_x_get_y offers', async () => {
    const distributor = await prisma.user.create({
      data: { email: 'dist-promo@example.com', password: 'x' },
      select: { id: true },
    });

    const buyer = await prisma.marketplaceUser.create({
      data: {
        username: 'buyerPromo',
        phone: '+620000000099',
        email: 'buyerPromo@example.com',
        name: 'Buyer Promo',
        storeName: 'Buyer Store',
        chosenAddress: 'Address',
      },
      select: { id: true },
    });

    const product = await prisma.product.create({
      data: {
        productId: 'P-PROMO-1',
        sku: 'SKU-PROMO-1',
        name: 'Promo Product',
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
      select: { id: true, productId: true, name: true },
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

    // buy 2 get 1 free (piece-based). With MOQ=1, ordering 3 pieces yields 1 free:
    // quantityAboveMOQ = 3 - 1 = 2 => 1 set => 1 free => totalQtyNeeded = 4.
    const offer = await prisma.offer.create({
      data: {
        offerId: 'OFFER-PROMO-1',
        name: 'Promo Offer',
        description: null,
        type: ['promotion'],
        status: 'active',
        userId: distributor.id,
        offerProducts: {
          create: [{ productId: product.productId }],
        },
        offerDiscountTypes: {
          create: [
            {
              discountType: 'buy_x_get_y',
              discountValue: 1,
              minQuantity: 2,
              isActive: true,
              priority: 1,
            },
          ],
        },
      },
      select: { id: true },
    });
    expect(offer.id).toBeTruthy();

    const res = await createMobileMarketplaceOrders(
      makeNextRequest('http://localhost/api/mobile/orders', {
        orderId: 'O-PROMO-1',
        orderDate: new Date().toISOString(),
        orderItems: [
          {
            productId: product.productId,
            quantity: 1,
            priceAtPurchase: '2000',
            subtotal: '2000',
            packageQuantity: 3, // 3 ordered pieces
            piecesPerPackage: 1,
            productName: product.name,
            productSku: 'SKU-PROMO-1',
            variantId: variant.id,
            category: 'TestType',
          },
        ],
        discounts: 0,
        shippingFee: 0,
        contactPerson: 'Buyer',
        storeName: 'Buyer Store',
        contactPhone: '+620000000099',
        customerEmail: 'buyerPromo@example.com',
        deliveryAddress: 'Address',
        deliveryMethod: 'Seller/Distributor Delivery',
        deliveryOption: null,
        orderStatus: 'Pending',
        paymentStatus: 'Unpaid',
        paymentTerms: 'Cash on Delivery',
        preferredDeliveryDate: null,
        preferredDeliveryTime: null,
        preferredPickupDate: null,
        preferredPickupTime: null,
        shippingMethodLabel: null,
        shippingMethod: null,
        estimatedDeliveryMinDays: null,
        estimatedDeliveryMaxDays: null,
        userId: buyer.id,
      }),
      buyer.id,
    );

    expect(res.status).toBe(201);
    const orderCount = await prisma.order.count();
    expect(orderCount).toBe(1);
    const updatedVariant = await prisma.variantOption.findUnique({ where: { id: variant.id } });
    expect(updatedVariant?.stockQuantity).toBe(6);
  });
});

