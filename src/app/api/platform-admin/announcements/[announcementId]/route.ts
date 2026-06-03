import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { notifyMarketplacePublishedAnnouncement, notifyMarketplaceUnpublishedAnnouncement } from '@/utils/platformAnnouncementNotify';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';
import { auditAdmin } from '@/lib/audit';

function getId(params: { announcementId?: string }) {
  const id = Number(params.announcementId);
  return Number.isFinite(id) ? id : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ announcementId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const params = await ctx.params;
    const id = getId(params);
    if (!id) return NextResponse.json({ error: 'Invalid announcement id' }, { status: 400, headers });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const patch = body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof patch.title === 'string') data.title = patch.title.trim();
    if (typeof patch.body === 'string') data.body = patch.body.trim();
    if (typeof patch.category === 'string') data.category = patch.category.trim() || 'update';
    if (typeof patch.imageUrl === 'string') data.imageUrl = patch.imageUrl.trim() || null;
    if (typeof patch.linkUrl === 'string') data.linkUrl = patch.linkUrl.trim() || null;
    if (typeof patch.isPublished === 'boolean') {
      data.isPublished = patch.isPublished;
      data.publishedAt = patch.isPublished ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400, headers });
    }

    const prev = await prisma.platformAnnouncement.findUnique({
      where: { id },
      select: { isPublished: true },
    });

    const updated = await prisma.platformAnnouncement.update({
      where: { id },
      data,
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

    const announcementJson = {
      ...updated,
      publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    if (updated.isPublished && !prev?.isPublished) {
      void notifyMarketplacePublishedAnnouncement({
        id: updated.id,
        title: updated.title,
        body: updated.body,
        category: updated.category,
        imageUrl: updated.imageUrl,
        linkUrl: updated.linkUrl,
        publishedAt: announcementJson.publishedAt,
        createdAt: announcementJson.createdAt,
      });
    }
    if (!updated.isPublished && prev?.isPublished) {
      void notifyMarketplaceUnpublishedAnnouncement(updated.id);
    }

    auditAdmin(req, {
      action: 'announcement.update',
      resourceType: 'PlatformAnnouncement',
      resourceId: String(id),
      actorId: adminId,
      metadata: { fields: Object.keys(data), isPublished: updated.isPublished },
    });

    return NextResponse.json(
      {
        ok: true,
        announcement: announcementJson,
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to update announcement' }, { status: 500, headers });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ announcementId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const params = await ctx.params;
    const id = getId(params);
    if (!id) return NextResponse.json({ error: 'Invalid announcement id' }, { status: 400, headers });

    await prisma.platformAnnouncement.delete({ where: { id } });

    auditAdmin(req, {
      action: 'announcement.delete',
      resourceType: 'PlatformAnnouncement',
      resourceId: String(id),
      actorId: adminId,
    });

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500, headers });
  }
}

