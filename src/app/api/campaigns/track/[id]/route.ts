import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { campaignTrackRateLimiter } from '@/utils/rateLimiter';

/**
 * Track campaign open or click event
 * POST /api/campaigns/track/[id]
 * Body: { type: 'open' | 'click' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await campaignTrackRateLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const body = await request.json();
    const { type } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      );
    }

    if (type !== 'open' && type !== 'click') {
      return NextResponse.json(
        { error: 'Invalid event type. Must be "open" or "click"' },
        { status: 400 }
      );
    }

    const safeId = id.trim();
    if (safeId.length > 128) {
      return NextResponse.json({ error: 'Campaign ID is too long' }, { status: 400 });
    }

    // Find campaign by ID or campaignId
    const campaign = await prisma.campaign.findFirst({
      where: {
        OR: [{ id: safeId }, { campaignId: safeId }],
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Track opens and clicks as counts using atomic increment to prevent race conditions
    if (type === 'open') {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          opensCount: { increment: 1 },
        },
      });
    } else if (type === 'click') {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          clicksCount: { increment: 1 },
        },
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}

