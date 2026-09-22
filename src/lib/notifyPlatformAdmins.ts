import { prisma } from '@/lib/db';
import { sendAdminRegistrationNoticeEmail } from '@/lib/email';
import { buildAdminDashboardUserUrl, buildAdminMarketplaceUserUrl } from '@/lib/emailVerification';
import { broadcastPlatformAdminInboxRefresh } from '@/utils/websocketBroadcast';

export async function notifyPlatformAdminsOfRegistration(args: {
  source: 'dashboard' | 'marketplace';
  userId: number;
  email: string | null;
  name: string;
  companyName?: string | null;
}): Promise<void> {
  const admins = await prisma.platformAdmin.findMany({
    where: { isActive: true },
    select: { email: true, name: true },
  });
  if (admins.length === 0) return;

  const reviewUrl =
    args.source === 'dashboard'
      ? buildAdminDashboardUserUrl(args.userId)
      : buildAdminMarketplaceUserUrl(args.userId);

  await Promise.all(
    admins.map((admin) =>
      sendAdminRegistrationNoticeEmail({
        to: admin.email,
        adminName: admin.name,
        registrantName: args.name,
        registrantEmail: args.email ?? '—',
        companyName: args.companyName,
        source: args.source,
        reviewUrl,
      }),
    ),
  );

  void broadcastPlatformAdminInboxRefresh().catch(() => {
    /* best-effort live refresh of admin inbox / manage-users */
  });
}
