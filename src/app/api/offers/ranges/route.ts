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

// GET /api/offers/ranges - Get all date ranges and time slots for the authenticated user
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

    // For now, return empty arrays since we don't have separate tables for ranges
    // In the future, you might want to create separate tables for DateRange and TimeSlot
    const dateRanges: any[] = [];
    const timeSlots: any[] = [];

    return NextResponse.json({ 
      dateRanges,
      timeSlots 
    });

  } catch (error) {
    console.error('Error fetching ranges:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ranges' },
      { status: 500 }
    );
  }
}

// POST /api/offers/ranges - Create a new date range or time slot
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
    const { type, ...rangeData } = body; // type: 'date' or 'time'

    // Validate required fields
    if (!type || !rangeData.name) {
      return NextResponse.json(
        { error: 'Type and name are required' },
        { status: 400 }
      );
    }

    // For now, we'll just return success since we don't have separate tables
    // In the future, you might want to create separate tables for DateRange and TimeSlot
    const newRange = {
      id: Date.now().toString(),
      ...rangeData,
      isActive: true,
      offerCount: 0,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      message: `${type} range created successfully`,
      range: newRange
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating range:', error);
    return NextResponse.json(
      { error: 'Failed to create range' },
      { status: 500 }
    );
  }
}
