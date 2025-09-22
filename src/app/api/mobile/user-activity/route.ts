import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../../generated/prisma';

const prisma = new PrismaClient();

// GET /api/mobile/user-activity - Get user activities by type
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const activityType = searchParams.get('type'); // 'favorite', 'viewed', 'purchased'
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!activityType) {
      return NextResponse.json(
        { error: 'Activity type is required' },
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

    // Get user activities by type
    const activities = await prisma.userActivity.findMany({
      where: { 
        userId: userIdNum,
        activityType: activityType
      },
      orderBy: { createdAt: 'desc' },
      take: activityType === 'viewed' ? 20 : undefined // Limit viewed products to 20 most recent
    });

    return NextResponse.json({
      success: true,
      activities
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch user activities' },
      { status: 500 }
    );
  }
}

// POST /api/mobile/user-activity - Add or update user activity
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, productId, productData, activityType, metadata } = body;
    
    if (!userId || !productId || !productData || !activityType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Check if activity already exists
    const existingActivity = await prisma.userActivity.findFirst({
      where: {
        userId: userIdNum,
        productId: productId,
        activityType: activityType
      }
    });

    if (existingActivity) {
      // Update existing activity
      const updatedActivity = await prisma.userActivity.update({
        where: { id: existingActivity.id },
        data: {
          productData: productData,
          metadata: metadata || existingActivity.metadata,
          updatedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        activity: updatedActivity,
        action: 'updated'
      });
    } else {
      // Create new activity
      const newActivity = await prisma.userActivity.create({
        data: {
          userId: userIdNum,
          productId: productId,
          productData: productData,
          activityType: activityType,
          metadata: metadata || {}
        }
      });

      return NextResponse.json({
        success: true,
        activity: newActivity,
        action: 'created'
      });
    }

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create/update user activity' },
      { status: 500 }
    );
  }
}

// DELETE /api/mobile/user-activity - Remove user activity
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const productId = searchParams.get('productId');
    const activityType = searchParams.get('type');
    
    if (!userId || !productId || !activityType) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
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

    // Find and delete the activity
    const deletedActivity = await prisma.userActivity.deleteMany({
      where: {
        userId: userIdNum,
        productId: productId,
        activityType: activityType
      }
    });

    return NextResponse.json({
      success: true,
      deletedCount: deletedActivity.count
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete user activity' },
      { status: 500 }
    );
  }
}
