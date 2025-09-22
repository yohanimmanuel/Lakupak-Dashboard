import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../../generated/prisma';

const prisma = new PrismaClient();

// GET /api/mobile/cart - Get user's cart items
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      return NextResponse.json(
        { error: 'Invalid user ID format' },
        { status: 400 }
      );
    }

    // Get cart items for user
    const cartItems = await prisma.userActivity.findMany({
      where: { 
        userId: userIdNum,
        activityType: 'cart'
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      cartItems
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch cart items' },
      { status: 500 }
    );
  }
}

// POST /api/mobile/cart - Add item to cart
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, productId, productData, quantity = 1, variant = 'Default' } = body;
    
    if (!userId || !productId || !productData) {
      return NextResponse.json(
        { error: 'User ID, Product ID, and Product Data are required' },
        { status: 400 }
      );
    }

    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      return NextResponse.json(
        { error: 'Invalid user ID format' },
        { status: 400 }
      );
    }

    // Check if item already exists in cart
    const existingItem = await prisma.userActivity.findFirst({
      where: {
        userId: userIdNum,
        productId,
        activityType: 'cart',
        metadata: {
          path: ['variant'],
          equals: variant
        }
      }
    });

    if (existingItem) {
      // Update quantity and product data
      const metadata = existingItem.metadata as any || {};
      const currentQuantity = metadata.quantity || 1;
      const updatedItem = await prisma.userActivity.update({
        where: { id: existingItem.id },
        data: { 
          productData: productData, // Update product data in case it changed
          metadata: {
            quantity: currentQuantity + quantity,
            variant: variant,
            selected: true
          },
          updatedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        cartItem: updatedItem,
        message: 'Cart item quantity updated'
      });
    } else {
      // Create new cart item
      const newItem = await prisma.userActivity.create({
        data: {
          userId: userIdNum,
          productId,
          productData: productData,
          activityType: 'cart',
          metadata: {
            quantity,
            variant,
            selected: true
          }
        }
      });

      return NextResponse.json({
        success: true,
        cartItem: newItem,
        message: 'Item added to cart'
      });
    }

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to add item to cart' },
      { status: 500 }
    );
  }
}

// PUT /api/mobile/cart - Update cart item
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { cartItemId, quantity, selected } = body;
    
    if (!cartItemId) {
      return NextResponse.json(
        { error: 'Cart item ID is required' },
        { status: 400 }
      );
    }

    const updateData: any = {
      updatedAt: new Date()
    };

    if (quantity !== undefined) {
      updateData.quantity = quantity;
    }

    if (selected !== undefined) {
      updateData.selected = selected;
    }

    const updatedItem = await prisma.userActivity.update({
      where: { id: cartItemId },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      cartItem: updatedItem,
      message: 'Cart item updated'
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update cart item' },
      { status: 500 }
    );
  }
}

// DELETE /api/mobile/cart - Remove item from cart
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cartItemId = searchParams.get('cartItemId');
    const userId = searchParams.get('userId');
    
    if (cartItemId) {
      // Delete specific item
      await prisma.userActivity.delete({
        where: { id: parseInt(cartItemId) }
      });

      return NextResponse.json({
        success: true,
        message: 'Cart item removed'
      });
    } else if (userId) {
      // Clear entire cart for user
      const userIdNum = parseInt(userId);
      if (isNaN(userIdNum)) {
        return NextResponse.json(
          { error: 'Invalid user ID format' },
          { status: 400 }
        );
      }

      await prisma.userActivity.deleteMany({
        where: { 
          userId: userIdNum,
          activityType: 'cart'
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Cart cleared'
      });
    } else {
      return NextResponse.json(
        { error: 'Cart item ID or User ID is required' },
        { status: 400 }
      );
    }

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to remove cart item' },
      { status: 500 }
    );
  }
}
