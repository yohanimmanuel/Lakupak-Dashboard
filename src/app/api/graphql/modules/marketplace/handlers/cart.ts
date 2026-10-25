import type { Prisma } from '@/lib/db';
import { prisma } from '../../common/prisma';

export const fetchMobileCart = async (userId: number, distributorId: number | null) => {
  // Fetch all cart items from database (keeping unpublished products in DB for history)
  const cartItems = await prisma.userActivity.findMany({
    where: { 
      userId,
      activityType: 'cart'
    },
    orderBy: { createdAt: 'desc' }
  });

  // Get productIds from cart items
  const productIds = cartItems.map(item => item.productId);

  const publishedProducts =
    distributorId && productIds.length > 0
      ? await prisma.product.findMany({
        where: {
          productId: { in: productIds },
          status: 'Published',
          marketplaceStatus: 'Published',
          userId: distributorId,
        },
        select: {
          productId: true
        }
      })
    : [];

  const publishedProductIds = new Set(publishedProducts.map(p => p.productId));

  // Filter cart items to only show published products
  // Unpublished products stay in DB but are hidden from cart
  const visibleCartItems = cartItems.filter(item => publishedProductIds.has(item.productId));

  return {
    items: visibleCartItems.map(item => ({
      id: item.id,
      userId: item.userId,
      productId: item.productId,
      productData: item.productData as Prisma.InputJsonValue,
      activityType: item.activityType,
      metadata: item.metadata as Prisma.InputJsonValue | null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    success: true
  };
};

export const addToCart = async (args: {
  userId: number;
  productId: string;
  productData: Record<string, unknown>;
  quantity?: number;
  variant?: string;
}) => {
  const { userId, productId, productData, quantity = 1, variant = 'Default' } = args;

  return prisma.$transaction(async (tx) => {
    const existingItem = await tx.userActivity.findFirst({
      where: {
        userId,
        productId,
        activityType: 'cart',
        metadata: {
          path: ['variant'],
          equals: variant,
        },
      },
    });

    let item: Awaited<ReturnType<typeof tx.userActivity.create>> | Awaited<ReturnType<typeof tx.userActivity.update>>;
    let message = 'Item added to cart';

    if (existingItem) {
      const metadata = (existingItem.metadata as { quantity?: number; variant?: string; selected?: boolean }) || {};
      const currentQuantity = metadata.quantity || 1;

      item = await tx.userActivity.update({
        where: { id: existingItem.id },
        data: {
          productData: productData as Prisma.InputJsonValue,
          metadata: {
            quantity: currentQuantity + quantity,
            variant: variant,
            selected: true,
          },
          updatedAt: new Date(),
        },
      });
      message = 'Cart item quantity updated';
    } else {
      item = await tx.userActivity.create({
        data: {
          userId,
          productId,
          productData: productData as Prisma.InputJsonValue,
          activityType: 'cart',
          metadata: {
            quantity,
            variant,
            selected: true,
          } as Prisma.InputJsonValue,
        },
      });
    }

    // Record a permanent "add to cart" event for analytics (never deleted on remove)
    await tx.userActivity.create({
      data: {
        userId,
        productId,
        productData: productData as Prisma.InputJsonValue,
        activityType: 'cart_added',
        metadata: { quantity, variant } as Prisma.InputJsonValue,
      },
    });

    return {
      success: true,
      cartItem: {
        id: item.id,
        userId: item.userId,
        productId: item.productId,
        productData: item.productData as Prisma.InputJsonValue,
        activityType: item.activityType,
        metadata: item.metadata as Prisma.InputJsonValue | null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
      message,
    };
  });
};

export const updateCartItem = async (args: {
  cartItemId: number;
  quantity?: number;
  selected?: boolean;
}) => {
  const { cartItemId, quantity, selected } = args;



  const existingItem = await prisma.userActivity.findUnique({
    where: { id: cartItemId }
  });

  if (!existingItem) {
    throw new Error('Cart item not found');
  }

  const metadata = (existingItem.metadata as Record<string, unknown>) || {};
  const updatedMetadata = { ...metadata };
  if (quantity !== undefined) updatedMetadata.quantity = quantity;
  if (selected !== undefined) updatedMetadata.selected = selected;

  const updatedItem = await prisma.userActivity.update({
    where: { id: cartItemId },
    data: {
      metadata: updatedMetadata as Prisma.InputJsonValue,
      updatedAt: new Date()
    }
  });

  return {
    success: true,
    cartItem: {
      id: updatedItem.id,
      userId: updatedItem.userId,
      productId: updatedItem.productId,
      productData: updatedItem.productData as Record<string, unknown>,
      activityType: updatedItem.activityType,
      metadata: updatedItem.metadata as Record<string, unknown> | null,
      createdAt: updatedItem.createdAt.toISOString(),
      updatedAt: updatedItem.updatedAt.toISOString(),
    },
    message: 'Cart item updated'
  };
};

export const removeCartItem = async (cartItemId: number) => {
  const item = await prisma.userActivity.findUnique({
    where: { id: cartItemId }
  });

  if (!item) {
    return {
      success: false,
      cartItem: null,
      message: 'Cart item not found',
    };
  }

  if (item && item.activityType === 'cart') {
    // Record abandonment only when user actually removes from cart (not when they purchase)
    await prisma.userActivity.create({
      data: {
        userId: item.userId,
        productId: item.productId,
        productData: item.productData as Prisma.InputJsonValue,
        activityType: 'cart_abandoned',
        metadata: item.metadata as Prisma.InputJsonValue
      }
    });
  }

  await prisma.userActivity.delete({
    where: { id: cartItemId }
  });

  return {
    success: true,
    cartItem: null,
    message: 'Cart item removed'
  };
};

export const clearCart = async (
  userId: number,
  options?: { trackAbandonment?: boolean }
) => {
  const trackAbandonment = options?.trackAbandonment !== false;

  const cartItems = await prisma.userActivity.findMany({
    where: {
      userId,
      activityType: 'cart'
    }
  });

  // Record abandonment only when the buyer clears cart manually — not after checkout
  if (trackAbandonment) {
    for (const item of cartItems) {
      await prisma.userActivity.create({
        data: {
          userId: item.userId,
          productId: item.productId,
          productData: item.productData as Prisma.InputJsonValue,
          activityType: 'cart_abandoned',
          metadata: item.metadata as Prisma.InputJsonValue
        }
      });
    }
  }

  await prisma.userActivity.deleteMany({
    where: {
      userId,
      activityType: 'cart'
    }
  });

  return {
    success: true,
    cartItem: null,
    message: 'Cart cleared'
  };
};

