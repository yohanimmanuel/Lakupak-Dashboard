import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminMutationRateLimiter, platformAdminReadRateLimiter } from '@/utils/rateLimiter';
import { Prisma } from '@prisma/client';
import { auditAdmin } from '@/lib/audit';

const SOURCES = ['dashboard', 'marketplace', 'driver'] as const;
type Source = (typeof SOURCES)[number];

function parseSource(s: string | undefined): Source | null {
  const x = (s ?? '').toLowerCase();
  return SOURCES.includes(x as Source) ? (x as Source) : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ source: string; id: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminReadRateLimiter(req, adminId, 'user-detail');
    if (rateLimitResponse) return rateLimitResponse;

    const params = await ctx.params;
    const source = parseSource(params.source);
    const id = Number(params.id);
    if (!source || !Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: 'Invalid user reference' }, { status: 400, headers });
    }

    if (source === 'dashboard') {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          isSuspended: true,
          suspendedAt: true,
          suspensionReason: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          currency: true,
          region: true,
          emailVerified: true,
          image: true,
          name: true,
          avatar: true,
          bio: true,
          phone: true,
          companyId: true,
          language: true,
          accountStatus: true,
          company: {
            select: {
              id: true,
              name: true,
              businessRegistrationNumber: true,
              taxId: true,
              logo: true,
              industryType: true,
              businessDescription: true,
              yearsInOperation: true,
              companySize: true,
              businessAddress: true,
              businessPhone: true,
              businessEmail: true,
              documentVerification: true,
              businessLicenseVerification: true,
              complianceStatus: true,
              nibDocumentUrl: true,
              nibDocumentName: true,
              npwpDocumentUrl: true,
              npwpDocumentName: true,
              shippingPreferences: true,
              deliveryTimeSlots: true,
              preferredDeliveryDays: true,
              specialInstructions: true,
              createdAt: true,
              updatedAt: true,
              bannerImage: true,
              pickupAddress: true,
              defaultDeliveryLeadTimeMinDays: true,
              defaultDeliveryLeadTimeMaxDays: true,
            },
          },
          reportedDistributorReports: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              reasonCode: true,
              reasonText: true,
              reasonDetail: true,
              imageUrls: true,
              createdAt: true,
              adminReadAt: true,
              reporter: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
          _count: {
            select: {
              products: true,
              orders: true,
              buyers: true,
              suppliers: true,
              drivers: true,
              fleets: true,
              offers: true,
              campaigns: true,
              salesAgents: true,
              salesTeams: true,
              notifications: true,
              distributorReviewsReceived: true,
              reportedDistributorReports: true,
            },
          },
        },
      });
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
      }
      return NextResponse.json({ source: 'dashboard' as const, data: user }, { status: 200, headers });
    }

    if (source === 'marketplace') {
      const user = await prisma.marketplaceUser.findUnique({
        where: { id },
        select: {
          id: true,
          isSuspended: true,
          suspendedAt: true,
          suspensionReason: true,
          username: true,
          email: true,
          bio: true,
          phone: true,
          country: true,
          createdAt: true,
          updatedAt: true,
          name: true,
          storeName: true,
          chosenAddress: true,
          image: true,
          bannerImage: true,
          addresses: {
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              fullName: true,
              phone: true,
              address: true,
              isDefault: true,
              label: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          userActivities: {
            take: 12,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              productId: true,
              activityType: true,
              createdAt: true,
            },
          },
          searchHistory: {
            take: 12,
            orderBy: { createdAt: 'desc' },
            select: { id: true, query: true, createdAt: true },
          },
          pushNotificationTokens: {
            select: { id: true, platform: true, isActive: true, createdAt: true },
          },
          _count: {
            select: {
              userActivities: true,
              searchHistory: true,
              pushNotificationTokens: true,
              productReviews: true,
              orderDeliveryReviews: true,
              distributorReviews: true,
              orderReturnRequests: true,
              orderCancellations: true,
            },
          },
        },
      });
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
      }
      return NextResponse.json({ source: 'marketplace' as const, data: user }, { status: 200, headers });
    }

    const driver = await prisma.driver.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
        phone: true,
        experience: true,
        status: true,
        avatar: true,
        username: true,
        lastLat: true,
        lastLng: true,
        lastLocationAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
            phone: true,
            company: {
              select: { id: true, name: true, businessEmail: true, complianceStatus: true },
            },
          },
        },
        fleets: {
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            fleetCode: true,
            route: true,
            routeFrom: true,
            routeTo: true,
            status: true,
            deliveryType: true,
            plateNumber: true,
            vehicleType: true,
            vehicleBrand: true,
            vehicleModel: true,
            lastUpdate: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        pushTokens: {
          select: { id: true, platform: true, isActive: true, createdAt: true },
        },
        failedReasons: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderId: true,
            reason: true,
            detail: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            fleets: true,
            failedReasons: true,
            pushTokens: true,
          },
        },
      },
    });
    if (!driver) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
    }
    return NextResponse.json({ source: 'driver' as const, data: driver }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('platform-admin user detail', err);
    return NextResponse.json({ error: 'Failed to load user' }, { status: 500, headers });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ source: string; id: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);
    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const params = await ctx.params;
    const source = parseSource(params.source);
    const id = Number(params.id);
    if (!source || !Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: 'Invalid user reference' }, { status: 400, headers });
    }

    if (source === 'dashboard') {
      const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, companyId: true },
      });
      if (!existing) {
        return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.account.deleteMany({ where: { userId: id } });
          await tx.session.deleteMany({ where: { userId: id } });
          await tx.passwordResetToken.deleteMany({ where: { userId: id } });
          await tx.emailVerificationToken.deleteMany({ where: { userId: id } });
          await tx.kycResubmitToken.deleteMany({ where: { userId: id } });
          await tx.buyer.updateMany({ where: { userId: id }, data: { userId: null } });
          await tx.supplier.updateMany({ where: { userId: id }, data: { userId: null } });
          await tx.product.updateMany({ where: { userId: id }, data: { userId: null } });
          await tx.order.updateMany({ where: { userId: id }, data: { userId: null } });
          await tx.offer.updateMany({ where: { userId: id }, data: { userId: null } });
          await tx.user.delete({ where: { id } });
          if (existing.companyId) {
            const remaining = await tx.user.count({ where: { companyId: existing.companyId } });
            if (remaining === 0) {
              await tx.company.delete({ where: { id: existing.companyId } }).catch(() => null);
            }
          }
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
          return NextResponse.json(
            { error: 'This account has related records and could not be deleted.' },
            { status: 409, headers },
          );
        }
        throw err;
      }

      auditAdmin(req, {
        action: 'user.delete',
        resourceType: 'User',
        resourceId: String(id),
        actorId: adminId,
        metadata: { accountType: 'dashboard', email: existing.email },
      });

      return NextResponse.json({ ok: true }, { status: 200, headers });
    }

    if (source === 'marketplace') {
      try {
        await prisma.marketplaceUser.delete({ where: { id } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
          return NextResponse.json(
            { error: 'This account has related records and could not be deleted.' },
            { status: 409, headers },
          );
        }
        throw err;
      }

      auditAdmin(req, {
        action: 'user.delete',
        resourceType: 'MarketplaceUser',
        resourceId: String(id),
        actorId: adminId,
        metadata: { accountType: 'marketplace' },
      });
      return NextResponse.json({ ok: true }, { status: 200, headers });
    }

    try {
      await prisma.driver.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        return NextResponse.json(
          { error: 'This account has related records and could not be deleted.' },
          { status: 409, headers },
        );
      }
      throw err;
    }

    auditAdmin(req, {
      action: 'user.delete',
      resourceType: 'Driver',
      resourceId: String(id),
      actorId: adminId,
      metadata: { accountType: 'driver' },
    });
    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('platform-admin user delete', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500, headers });
  }
}

