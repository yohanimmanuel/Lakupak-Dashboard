import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAccessToken } from '@/lib/jwt';

// POST /api/mobile/push-token - Register push notification token (requires auth, ownership enforced)
export async function POST(request: NextRequest) {
  try {
    // (1) Authenticate and extract authenticated user id
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    let authUserId: number;
    try {
      const payload = verifyAccessToken(authHeader.replace('Bearer ', ''));
      authUserId = payload.sub;
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { userId, token, platform } = body;

    if (!userId || !token || !platform) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, token, platform' },
        { status: 400 }
      );
    }

    // (2) Validate userId is an integer and matches the authenticated user
    const parsedUserId = Number(userId);
    if (Number.isNaN(parsedUserId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' },
        { status: 400 }
      );
    }

    if (parsedUserId !== authUserId) {
      return NextResponse.json(
        { error: 'Authenticated user does not match the provided userId' },
        { status: 403 }
      );
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      return NextResponse.json(
        { error: 'Invalid platform. Must be ios, android, or web' },
        { status: 400 }
      );
    }

    // Guard: marketplace user must exist (authorization is based on authUserId)
    const marketplaceUser = await prisma.marketplaceUser.findUnique({
      where: { id: authUserId },
    });

    if (!marketplaceUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // (3) Do not reassign an existing token to a different user
    const existing = await prisma.pushNotificationToken.findFirst({
      where: { token },
    });

    if (existing && existing.userId !== authUserId) {
      return NextResponse.json(
        { error: 'This push token is already registered to a different user' },
        { status: 409 }
      );
    }

    // Update (same user) or create; never change userId on update
    const pushToken = await prisma.pushNotificationToken.upsert({
      where: { token },
      update: {
        platform,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId: authUserId,
        token,
        platform,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      pushToken: {
        id: pushToken.id,
        token: pushToken.token,
        platform: pushToken.platform,
      },
    });
  } catch (error) {
    console.error('Error registering push token:', error);
    return NextResponse.json(
      { error: 'Failed to register push token' },
      { status: 500 }
    );
  }
}

// DELETE /api/mobile/push-token - Remove push notification token (requires auth, ownership verified)
export async function DELETE(request: NextRequest) {
  try {
    // Require authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    let authUserId: number;
    try {
      const payload = verifyAccessToken(authHeader.replace('Bearer ', ''));
      authUserId = payload.sub;
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Missing required field: token' },
        { status: 400 }
      );
    }

    const existing = await prisma.pushNotificationToken.findFirst({
      where: { token },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Push token not found' },
        { status: 404 }
      );
    }

    if (existing.userId !== authUserId) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this push token' },
        { status: 403 }
      );
    }

    await prisma.pushNotificationToken.deleteMany({
      where: { token, userId: authUserId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing push token:', error);
    return NextResponse.json(
      { error: 'Failed to remove push token' },
      { status: 500 }
    );
  }
}

// GET /api/mobile/push-token - Get user's push tokens
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      );
    }

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' },
        { status: 400 }
      );
    }

    const tokens = await prisma.pushNotificationToken.findMany({
      where: {
        userId: parsedUserId,
        isActive: true,
      },
      select: {
        id: true,
        token: true,
        platform: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error('Error fetching push tokens:', error);
    return NextResponse.json(
      { error: 'Failed to fetch push tokens' },
      { status: 500 }
    );
  }
}
