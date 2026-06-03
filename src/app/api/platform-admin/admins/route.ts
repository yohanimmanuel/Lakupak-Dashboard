import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders, validateAuthInput } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { hash } from 'bcryptjs';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';
import { auditAdmin } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);

    const admins = await prisma.platformAdmin.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, isActive: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ admins }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load admins' }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const creatorId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, creatorId);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const { email, password, name } = body as { email?: unknown; password?: unknown; name?: unknown };
    const emailValidation = validateAuthInput.email(String(email));
    if (!emailValidation.valid) {
      return NextResponse.json({ error: emailValidation.error }, { status: 400, headers });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400, headers });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const displayName = typeof name === 'string' ? name.trim() : undefined;
    const passwordHash = await hash(password, 10);

    // creatorId is not persisted yet (optional), but we keep it to avoid unused var and for future audit.
    void creatorId;

    const created = await prisma.platformAdmin.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: displayName && displayName.length > 0 ? displayName : null,
        isActive: true,
      },
      select: { id: true, email: true, name: true, isActive: true, createdAt: true, updatedAt: true },
    });

    auditAdmin(req, {
      action: 'admin.create',
      resourceType: 'PlatformAdmin',
      resourceId: String(created.id),
      actorId: creatorId,
      metadata: { email: normalizedEmail },
    });

    return NextResponse.json({ ok: true, admin: created }, { status: 201, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500, headers });
  }
}

