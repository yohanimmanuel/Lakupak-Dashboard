import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';

function parseLimit(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('limit');
  const n = raw ? Number(raw) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(1, Math.floor(n)), 100);
}

/**
 * Public read-only feed for the Marketplace app ("Latest updates").
 * Only returns published announcements; no authentication required.
 */
export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const limit = parseLimit(req);
    const { searchParams } = new URL(req.url);
    const categoryRaw = searchParams.get('category');
    const category =
      typeof categoryRaw === 'string' && categoryRaw.trim().length > 0
        ? categoryRaw.trim()
        : null;

    const announcements = await prisma.platformAnnouncement.findMany({
      where: {
        isPublished: true,
        ...(category ? { category } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        category: true,
        imageUrl: true,
        linkUrl: true,
        publishedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        announcements: announcements.map((a) => ({
          ...a,
          publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
          createdAt: a.createdAt.toISOString(),
        })),
      },
      { status: 200, headers }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to load latest updates' }, { status: 500, headers });
  }
}
