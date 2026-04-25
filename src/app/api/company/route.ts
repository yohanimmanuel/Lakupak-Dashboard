import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const authenticatedUserId = await getAuthenticatedUserId(request);
    
    if (!authenticatedUserId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // 2. Get and validate requested userId
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');

    if (!userIdParam) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Parse and validate userId as integer
    const parsedUserId = parseInt(userIdParam, 10);
    if (isNaN(parsedUserId) || !Number.isInteger(parsedUserId) || parsedUserId <= 0) {
      return NextResponse.json(
        { error: 'Invalid User ID. Must be a positive integer.' },
        { status: 400 }
      );
    }

    // 3. Authorization check: ensure user can only access their own company data
    if (authenticatedUserId !== parsedUserId) {
      return NextResponse.json(
        { error: 'Forbidden. You can only access your own company data.' },
        { status: 403 }
      );
    }

    // 4. Fetch company data for the authenticated user
    const company = await prisma.company.findFirst({
      where: {
        users: {
          some: {
            id: parsedUserId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        logo: true,
        bannerImage: true,
        businessAddress: true,
        businessPhone: true,
        businessEmail: true,
        pickupAddress: true,
        billingBankName: true,
        billingBankAccountName: true,
        billingBankAccountNumber: true,
        billingCompanyName: true,
        billingAddressLine1: true,
        billingCity: true,
        billingState: true,
        billingPostalCode: true,
        billingCountry: true,
        billingContactPhone: true,
        billingContactEmail: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error fetching company data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company data' },
      { status: 500 }
    );
  }
}
