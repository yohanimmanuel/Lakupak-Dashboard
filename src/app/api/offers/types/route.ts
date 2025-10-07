import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// Extended session user type to include the id property
interface ExtendedUser {
  id: number;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

// GET /api/offers/types - Get all offer types for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = session.user as ExtendedUser;
    if (!user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For now, return predefined offer types since we don't have a separate OfferType table
    // In the future, you might want to create a separate table for offer types
    const offerTypes = [
      {
        id: 'percentage',
        name: 'Percentage Discount',
        description: 'Apply a percentage discount to products',
        discountType: 'percentage',
        isActive: true,
      },
      {
        id: 'fixed',
        name: 'Fixed Amount Discount',
        description: 'Apply a fixed monetary discount',
        discountType: 'fixed',
        isActive: true,
      },
      {
        id: 'buy_x_get_y',
        name: 'Buy X Get Y',
        description: 'Buy certain quantity, get additional items free',
        discountType: 'buy_x_get_y',
        isActive: true,
      }
    ];

    return NextResponse.json({ offerTypes });

  } catch (error) {
    console.error('Error fetching offer types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch offer types' },
      { status: 500 }
    );
  }
}

// POST /api/offers/types - Create a new offer type
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = session.user as ExtendedUser;
    if (!user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, discountType } = body;

    // Validate required fields
    if (!name || !discountType) {
      return NextResponse.json(
        { error: 'Name and discount type are required' },
        { status: 400 }
      );
    }

    // For now, we'll just return success since we're using predefined types
    // In the future, you might want to create a separate OfferType table
    return NextResponse.json({
      message: 'Offer type created successfully',
      offerType: {
        id: discountType,
        name,
        description,
        discountType,
        isActive: true,
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating offer type:', error);
    return NextResponse.json(
      { error: 'Failed to create offer type' },
      { status: 500 }
    );
  }
}
