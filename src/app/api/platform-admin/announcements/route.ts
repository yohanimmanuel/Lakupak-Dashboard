import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';

function parseLimit(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('limit');
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n)) return 20;
  return Math.min(Math.max(1, Math.floor(n)), 100);
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);
    const limit = parseLimit(req);
    const announcements = await prisma.platformAnnouncement.findMany({
      orderBy: [{ isPublished: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        category: true,
        imageUrl: true,
        linkUrl: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        announcements: announcements.map((a) => ({
          ...a,
          publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load announcements' }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const {
      title,
      body: content,
      category,
      imageUrl,
      linkUrl,
      isPublished,
    } = body as Record<string, unknown>;

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400, headers });
    }
    if (!content || typeof content !== 'string' || content.trim().length < 3) {
      return NextResponse.json({ error: 'Body is required.' }, { status: 400, headers });
    }

    const created = await prisma.platformAnnouncement.create({
      data: {
        title: title.trim(),
        body: content.trim(),
        category: typeof category === 'string' && category.trim() ? category.trim() : 'update',
        imageUrl: typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null,
        linkUrl: typeof linkUrl === 'string' && linkUrl.trim() ? linkUrl.trim() : null,
        isPublished: typeof isPublished === 'boolean' ? isPublished : false,
        publishedAt: typeof isPublished === 'boolean' && isPublished ? new Date() : null,
        createdByAdminId: adminId,
      },
      select: {
        id: true,
        title: true,
        body: true,
        category: true,
        imageUrl: true,
        linkUrl: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        announcement: {
          ...created,
          publishedAt: created.publishedAt ? created.publishedAt.toISOString() : null,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500, headers });
  }
}

