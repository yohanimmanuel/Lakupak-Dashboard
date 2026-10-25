import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requireDistributorMember } from '@/lib/marketplace/routeGuard';

/**
 * GET /api/mobile/distributor/[id]
 * Distributor/seller profile (Distributor Operations data for display), for retailers
 * who joined this distributor's storefront with its referral code.
 * Returns company info: name, logo, banner, businessRegistrationNumber, etc.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const headers = getSecurityHeaders();

  try {
    const { id } = await params;
    const distributorId = id ? parseInt(id, 10) : NaN;
    if (!Number.isFinite(distributorId) || distributorId < 1) {
      return NextResponse.json({ error: 'Invalid distributor id' }, { status: 400, headers });
    }

    const guard = await requireDistributorMember(request, distributorId, headers);
    if (!guard.ok) return guard.response;

    const user = await prisma.user.findUnique({
      where: { id: distributorId },
      include: {
        company: {
          select: {
            name: true,
            logo: true,
            bannerImage: true,
            businessRegistrationNumber: true,
            industryType: true,
            businessDescription: true,
            yearsInOperation: true,
            deliveryCoverageArea: true,
            fulfillmentNotes: true,
            businessAddress: true,
            businessPhone: true,
            businessEmail: true,
            shippingPreferences: true,
            deliveryTimeSlots: true,
            preferredDeliveryDays: true,
            pickupAddress: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Distributor not found' }, { status: 404, headers });
    }

    const company = user.company;
    const displayName = company?.name || user.name || `Distributor #${user.id}`;

    const followersCount = await prisma.distributorFollowing.count({ where: { distributorId: user.id } });

    const parseJsonArray = (s: string | null | undefined): string[] => {
      if (!s || typeof s !== 'string') return [];
      try {
        const parsed = JSON.parse(s) as unknown;
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        return [];
      }
    };

    const payload = {
      id: user.id,
      name: displayName,
      logo: company?.logo ?? user.image ?? null,
      bannerImage: company?.bannerImage ?? null,
      companyName: company?.name ?? null,
      followersCount,
      businessRegistrationNumber: company?.businessRegistrationNumber ?? null,
      industryType: company?.industryType ?? null,
      businessDescription: company?.businessDescription ?? null,
      yearsInOperation: company?.yearsInOperation ?? null,
      deliveryCoverageArea: company?.deliveryCoverageArea ?? null,
      fulfillmentNotes: company?.fulfillmentNotes ?? null,
      businessAddress: company?.businessAddress ?? null,
      businessPhone: company?.businessPhone ?? user.phone ?? null,
      businessEmail: company?.businessEmail ?? user.email ?? null,
      shippingPreferences: parseJsonArray(company?.shippingPreferences ?? undefined),
      deliveryTimeSlots: parseJsonArray(company?.deliveryTimeSlots ?? undefined),
      preferredDeliveryDays: parseJsonArray(company?.preferredDeliveryDays ?? undefined),
      pickupAddress: company?.pickupAddress ?? null,
    };

    return NextResponse.json(payload, { status: 200, headers });
  } catch (e) {
    console.error('Distributor profile fetch error:', e);
    return NextResponse.json(
      { error: 'Failed to load distributor information.' },
      { status: 500, headers }
    );
  }
}
