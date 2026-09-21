import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { verifyEmailRateLimiter } from '@/utils/rateLimiter';
import { hashEmailVerifyToken } from '@/lib/emailVerification';

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  const limited = await verifyEmailRateLimiter(req);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length < 16 || token.length > 200) {
      return NextResponse.json({ error: 'Invalid or expired verification link.' }, { status: 400, headers });
    }

    const tokenHash = hashEmailVerifyToken(token);
    const record = await prisma.emailVerificationToken.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      include: {
        user: { select: { id: true, email: true, firstName: true, emailVerified: true } },
      },
    });

    if (!record) {
      return NextResponse.json({ error: 'Invalid or expired verification link.' }, { status: 400, headers });
    }

    const alreadyVerified = Boolean(record.user.emailVerified);

    await prisma.$transaction(async (tx) => {
      if (!alreadyVerified) {
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerified: new Date() },
        });
      }
      await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
    });

    return NextResponse.json(
      { ok: true, alreadyVerified, loginUrl: '/login' },
      { status: 200, headers: { ...headers, 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Unable to verify email. Please try again.' }, { status: 500, headers });
  }
}
