import { createHash, randomBytes } from 'crypto';

export const EMAIL_VERIFY_EXPIRY_HOURS = 48;
export const KYC_RESUBMIT_EXPIRY_DAYS = 14;

export function getDashboardAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.DASHBOARD_RESET_PASSWORD_BASE_URL ||
    '';
  return raw.trim().replace(/\/$/, '');
}

export function generateEmailVerifyToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashEmailVerifyToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export function buildEmailVerifyUrl(token: string): string {
  const base = getDashboardAppBaseUrl();
  const path = `/verify-email?token=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

function buildAbsoluteAppUrl(path: string): string {
  const base = getDashboardAppBaseUrl();
  if (base) return `${base}${path}`;
  console.error(
    `[emailVerification] Dashboard app base URL is missing; email link "${path}" will be relative and unusable. Set NEXT_PUBLIC_APP_URL or NEXTAUTH_URL.`,
  );
  return path;
}

export function buildKycResubmitUrl(token: string): string {
  return buildAbsoluteAppUrl(`/resubmit-kyc?token=${encodeURIComponent(token)}`);
}

export function buildLoginUrl(): string {
  return buildAbsoluteAppUrl('/login');
}

export function buildAdminDashboardUserUrl(userId: number): string {
  return buildAbsoluteAppUrl(`/admin/users/dashboard/${userId}`);
}

export function buildAdminMarketplaceUserUrl(userId: number): string {
  return buildAbsoluteAppUrl(`/admin/users/marketplace/${userId}`);
}
