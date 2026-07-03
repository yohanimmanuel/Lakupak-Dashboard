import { prisma } from '@/lib/db';
import { createProduct } from '@/app/api/graphql/modules/products';

export async function createTestDistributor() {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: { email: `dist_${suffix}@integration.test`, password: 'x' },
    select: { id: true },
  });
}

const baseVariantOption = {
  purchasePrice: '1000',
  sellingPrice: '2000',
  originalSellingPrice: '2000',
  moq: 1,
  stockQuantity: 10,
  lowStockThreshold: 0,
  stockStatus: 'In Stock',
  isDefault: false,
  isActive: true,
};

export async function createDraftProductReadyToPublish(userId: number, productId: string) {
  return createProduct({
    userId,
    productId,
    sku: `SKU-${productId}`,
    name: 'Publish Test Product',
    description: 'Ready for marketplace publish',
    productType: 'Grocery',
    brand: 'TestBrand',
    supplier: 'TestSupplier',
    status: 'Draft',
    productCategory: 'Retail',
    catalogName: 'Default',
    images: ['https://example.com/product.jpg'],
    variantOptions: [
      {
        ...baseVariantOption,
        variantName: 'Default',
        attributes: {},
        isDefault: true,
      },
    ],
  });
}

export async function createDraftProductWithoutImages(userId: number, productId: string) {
  return createProduct({
    userId,
    productId,
    sku: `SKU-${productId}`,
    name: 'No Image Product',
    description: 'Missing images',
    productType: 'Grocery',
    brand: 'TestBrand',
    supplier: 'TestSupplier',
    status: 'Draft',
    productCategory: 'Retail',
    catalogName: 'Default',
    images: [],
    variantOptions: [
      {
        ...baseVariantOption,
        variantName: 'Default',
        attributes: {},
        isDefault: true,
      },
    ],
  });
}

export async function createDraftProductWithoutStock(userId: number, productId: string) {
  return createProduct({
    userId,
    productId,
    sku: `SKU-${productId}`,
    name: 'No Stock Product',
    description: 'Zero stock',
    productType: 'Grocery',
    brand: 'TestBrand',
    supplier: 'TestSupplier',
    status: 'Draft',
    productCategory: 'Retail',
    catalogName: 'Default',
    images: ['https://example.com/product.jpg'],
    variantOptions: [
      {
        ...baseVariantOption,
        variantName: 'Default',
        attributes: {},
        stockQuantity: 0,
        stockStatus: 'Out of Stock',
        isDefault: true,
      },
    ],
  });
}

export async function createPublishedProductWithColorVariants(userId: number, productId: string) {
  return createProduct({
    userId,
    productId,
    sku: `SKU-${productId}`,
    name: 'Sync Test Shirt',
    description: 'Integration test product',
    productType: 'Apparel',
    brand: 'TestBrand',
    supplier: 'TestSupplier',
    status: 'Published',
    productCategory: 'Retail',
    catalogName: 'Default',
    images: [],
    variantDefinitions: [
      { variantType: 'Color', options: ['Black', 'White', 'Yellow'], position: 0 },
      { variantType: 'Size', options: ['M'], position: 1 },
    ],
    variantOptions: [
      {
        ...baseVariantOption,
        variantName: 'Color: Black | Size: M',
        attributes: { Color: 'Black', Size: 'M' },
        isDefault: true,
      },
      {
        ...baseVariantOption,
        variantName: 'Color: White | Size: M',
        attributes: { Color: 'White', Size: 'M' },
      },
      {
        ...baseVariantOption,
        variantName: 'Color: Yellow | Size: M',
        attributes: { Color: 'Yellow', Size: 'M' },
      },
    ],
  });
}

export async function createMinimalOrderForVariant(opts: {
  distributorUserId: number;
  productId: string;
  variantOptionId: number;
  variantNameSnapshot: string;
  orderId: string;
}) {
  await prisma.order.create({
    data: {
      orderId: opts.orderId,
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
      userId: opts.distributorUserId,
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
      orderId: opts.orderId,
      productId: opts.productId,
      subtotal: 2000,
      packageType: 'Box',
      piecesPerPackage: 1,
      packageQuantity: 1,
      pricePerPackage: 2000,
      productNameSnapshot: 'Sync Test Shirt',
      productSkuSnapshot: `SKU-${opts.productId}`,
      productTypeSnapshot: 'Apparel',
      variantOptionId: opts.variantOptionId,
      variantNameSnapshot: opts.variantNameSnapshot,
      offerApplied: false,
      promotionDetailsSnapshot: null,
      moqSnapshot: 1,
    },
  });
}
