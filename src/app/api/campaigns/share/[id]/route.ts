import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { type Prisma } from '@/lib/db';

/**
 * Map campaign from Prisma to API format
 */
const mapCampaign = (campaign: Prisma.CampaignGetPayload<{}>): {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  status: string;
  sentDate: string | null;
  recipients: string;
  opensCount: number;
  clicksCount: number;
  revenue: number;
  orders: number;
  contentBlocks: unknown[] | null;
  userId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
} => {
  return {
    id: campaign.id,
    campaignId: campaign.campaignId,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    sentDate: campaign.sentDate ? campaign.sentDate.toISOString() : null,
    recipients: campaign.recipients,
    opensCount: campaign.opensCount ?? 0,
    clicksCount: campaign.clicksCount ?? 0,
    revenue: campaign.revenue.toNumber(),
    orders: campaign.orders,
    contentBlocks: campaign.contentBlocks as unknown[] | null,
    userId: campaign.userId,
    createdAt: campaign.createdAt ? campaign.createdAt.toISOString() : null,
    updatedAt: campaign.updatedAt ? campaign.updatedAt.toISOString() : null,
  };
};

/**
 * Public API endpoint to fetch campaign by ID for sharing
 * No authentication required - campaigns are publicly shareable
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      );
    }

    // Find campaign by ID or campaignId
    const campaign = await prisma.campaign.findFirst({
      where: {
        OR: [{ id }, { campaignId: id }],
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Map and return campaign data
    const mappedCampaign = mapCampaign(campaign);

    return NextResponse.json(mappedCampaign, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch campaign' },
      { status: 500 }
    );
  }
}

