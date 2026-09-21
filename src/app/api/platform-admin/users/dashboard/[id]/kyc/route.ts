import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';
import { Prisma } from '@prisma/client';
import { auditAdmin } from '@/lib/audit';
import { buildKycResubmitUrl, buildLoginUrl, generateEmailVerifyToken, hashEmailVerifyToken, KYC_RESUBMIT_EXPIRY_DAYS } from '@/lib/emailVerification';
import { sendAccountApprovedEmail, sendKycRejectedEmail } from '@/lib/email';

function parseId(params: { id?: string }) {
  const n = Number(params.id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);
    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const params = await ctx.params;
    const id = parseId(params);
    if (!id) return NextResponse.json({ error: 'Invalid user id' }, { status: 400, headers });

    const body = await req.json().catch(() => null);
    const action = body?.action === 'reject' ? 'reject' : body?.action === 'approve' ? 'approve' : null;
    if (!action) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400, headers });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        accountStatus: true,
        companyId: true,
        company: {
          select: {
            id: true,
            nibDocumentUrl: true,
            npwpDocumentUrl: true,
            complianceStatus: true,
            documentVerification: true,
            businessLicenseVerification: true,
          },
        },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
    }
    if (!user.company || !user.companyId) {
      return NextResponse.json({ error: 'This distributor has no company profile to review.' }, { status: 400, headers });
    }

    if (action === 'approve') {
      if (!user.company.nibDocumentUrl || !user.company.npwpDocumentUrl) {
        return NextResponse.json(
          { error: 'NIB and NPWP documents are required before approval.' },
          { status: 400, headers },
        );
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: user.companyId! },
          data:
            action === 'approve'
              ? {
                  documentVerification: true,
                  businessLicenseVerification: true,
                  complianceStatus: 'Verified',
                }
              : {
                  documentVerification: false,
                  businessLicenseVerification: false,
                  complianceStatus: 'Rejected',
                },
        });
        await tx.user.update({
          where: { id },
          data: { accountStatus: action === 'approve' ? 'active' : 'pending' },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
      }
      throw err;
    }

    auditAdmin(req, {
      action: action === 'approve' ? 'user.kyc.approve' : 'user.kyc.reject',
      resourceType: 'User',
      resourceId: String(id),
      actorId: adminId,
      metadata: { accountType: 'dashboard', companyId: user.companyId },
    });

    if (action === 'approve') {
      await sendAccountApprovedEmail({
        to: user.email,
        firstName: user.firstName,
        loginUrl: buildLoginUrl(),
      });
    } else {
      const rawToken = generateEmailVerifyToken();
      const tokenHash = hashEmailVerifyToken(rawToken);
      const expiresAt = new Date(Date.now() + KYC_RESUBMIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      await prisma.kycResubmitToken.deleteMany({ where: { userId: user.id } });
      await prisma.kycResubmitToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
      await sendKycRejectedEmail({
        to: user.email,
        firstName: user.firstName,
        resubmitUrl: buildKycResubmitUrl(rawToken),
      });
    }

    return NextResponse.json(
      {
        ok: true,
        accountStatus: action === 'approve' ? 'active' : 'pending',
        complianceStatus: action === 'approve' ? 'Verified' : 'Rejected',
      },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to update KYC review' }, { status: 500, headers });
  }
}
