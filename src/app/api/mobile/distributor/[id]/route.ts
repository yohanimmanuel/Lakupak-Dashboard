import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';

/**
 * GET /api/mobile/distributor/[id]
 * Public distributor/seller profile (Distributor Operations data for display).
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
      businessRegistrationNumber: company?.businessRegistrationNumber ?? null,
      industryType: company?.industryType ?? null,
      businessDescription: company?.businessDescription ?? null,
      yearsInOperation: company?.yearsInOperation ?? null,
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
