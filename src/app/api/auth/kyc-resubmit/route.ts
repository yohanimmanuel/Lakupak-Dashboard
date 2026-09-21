import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { kycResubmitRateLimiter } from '@/utils/rateLimiter';
import { hashEmailVerifyToken } from '@/lib/emailVerification';
import { isAllowedKycStoredUrl, sanitizeKycFilename } from '@/lib/kyc/documents';

async function findValidResubmit(token: string) {
  const tokenHash = hashEmailVerifyToken(token);
  return prisma.kycResubmitToken.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          accountStatus: true,
          companyId: true,
        },
      },
    },
  });
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  const limited = await kycResubmitRateLimiter(req);
  if (limited) return limited;

  const token = (req.nextUrl.searchParams.get('token') ?? '').trim();
  if (!token || token.length < 16 || token.length > 200) {
    return NextResponse.json({ error: 'This upload link is invalid or has expired.' }, { status: 400, headers });
  }

  const record = await findValidResubmit(token);
  if (!record?.user?.companyId) {
    return NextResponse.json({ error: 'This upload link is invalid or has expired.' }, { status: 400, headers });
  }

  return NextResponse.json(
    { ok: true, email: record.user.email },
    { status: 200, headers: { ...headers, 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  const limited = await kycResubmitRateLimiter(req);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length < 16 || token.length > 200) {
      return NextResponse.json({ error: 'This upload link is invalid or has expired.' }, { status: 400, headers });
    }

    const record = await findValidResubmit(token);
    if (!record?.user?.companyId) {
      return NextResponse.json({ error: 'This upload link is invalid or has expired.' }, { status: 400, headers });
    }

    if (!isAllowedKycStoredUrl(body?.nibDocumentUrl) || !isAllowedKycStoredUrl(body?.npwpDocumentUrl)) {
      return NextResponse.json(
        { error: 'NIB and NPWP documents are required.' },
        { status: 400, headers },
      );
    }

    const nibName = sanitizeKycFilename(typeof body?.nibDocumentName === 'string' ? body.nibDocumentName : 'NIB');
    const npwpName = sanitizeKycFilename(typeof body?.npwpDocumentName === 'string' ? body.npwpDocumentName : 'NPWP');
    const nibPublicId =
      typeof body?.nibDocumentPublicId === 'string' && body.nibDocumentPublicId.trim()
        ? body.nibDocumentPublicId.trim().slice(0, 200)
        : null;
    const npwpPublicId =
      typeof body?.npwpDocumentPublicId === 'string' && body.npwpDocumentPublicId.trim()
        ? body.npwpDocumentPublicId.trim().slice(0, 200)
        : null;

    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: record.user.companyId! },
        data: {
          nibDocumentUrl: String(body.nibDocumentUrl).trim(),
          nibDocumentName: nibName,
          nibDocumentPublicId: nibPublicId,
          npwpDocumentUrl: String(body.npwpDocumentUrl).trim(),
          npwpDocumentName: npwpName,
          npwpDocumentPublicId: npwpPublicId,
          documentVerification: false,
          businessLicenseVerification: false,
          complianceStatus: 'Pending',
        },
      });
      await tx.user.update({
        where: { id: record.user.id },
        data: { accountStatus: 'pending' },
      });
      await tx.kycResubmitToken.deleteMany({ where: { userId: record.user.id } });
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { ...headers, 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Unable to save documents. Please try again.' }, { status: 500, headers });
  }
}
