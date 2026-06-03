import type { NextRequest } from 'next/server';
import { getClientIp } from '@/utils/rateLimiter';
import { getDbSecurityContext } from './db';
import {
  recordAuditEvent,
  type AuditActorType,
  type AuditEventInput,
} from './db-security';

/**
 * Curated audit logging for "must-audit" business and security actions.
 *
 * This is the request-facing wrapper around {@link recordAuditEvent}. It extracts
 * the client IP from the incoming request and emits a single, intentional event
 * per user action (in contrast to the low-level per-Prisma-operation logging done
 * by the database security middleware).
 *
 * Audit scope (B2B marketplace):
 *  - Orders: create, update, status change, cancel, archive, delete, returns, payment intent
 *  - Platform-admin: privileged mutations (suspension, offers, term maps, announcements, ...)
 *  - Auth: register, login, password reset/change, 2FA, OTP
 *  - Account: profile/company/payment-method changes
 */

export const AuditCategory = {
  ORDERS: 'orders',
  ADMIN: 'admin',
  AUTH: 'auth',
  ACCOUNT: 'account',
  CATALOG: 'catalog',
  REPORTS: 'reports',
} as const;

export type AuditCategoryValue =
  (typeof AuditCategory)[keyof typeof AuditCategory];

export type { AuditActorType };

type BaseAuditOptions = Omit<AuditEventInput, 'ip'>;

/**
 * Emit a curated audit event for an HTTP request. The client IP is derived from
 * the request headers and redacted before storage. Never throws or blocks.
 */
export function audit(
  req: NextRequest | null | undefined,
  options: BaseAuditOptions
): void {
  recordAuditEvent({
    ...options,
    ip: req ? getClientIp(req) : undefined,
  });
}

/**
 * Convenience helper for order-domain events. `action` is a short verb such as
 * 'create', 'update', 'status_change', 'cancel', 'delete', 'return_request'.
 */
export function auditOrder(
  req: NextRequest | null | undefined,
  options: Omit<BaseAuditOptions, 'category' | 'resourceType'>
): void {
  audit(req, {
    ...options,
    action: `order.${options.action}`,
    category: AuditCategory.ORDERS,
    resourceType: 'Order',
  });
}

/**
 * Convenience helper for privileged platform-admin actions. Defaults `actorType`
 * to 'platform-admin'. `action` should be namespaced, e.g. 'user.suspend' or
 * 'offer.create' (it is recorded as `admin.<action>`).
 */
export function auditAdmin(
  req: NextRequest | null | undefined,
  options: Omit<BaseAuditOptions, 'category'>
): void {
  audit(req, {
    actorType: 'platform-admin',
    ...options,
    action: `admin.${options.action}`,
    category: AuditCategory.ADMIN,
  });
}

/**
 * Convenience helper for authentication and credential events. `action` should
 * be namespaced, e.g. 'login', 'register', 'password.change' (recorded as
 * `auth.<action>`). NEVER pass credentials in metadata.
 */
export function auditAuth(
  req: NextRequest | null | undefined,
  options: Omit<BaseAuditOptions, 'category'>
): void {
  audit(req, {
    ...options,
    action: `auth.${options.action}`,
    category: AuditCategory.AUTH,
  });
}

/**
 * Convenience helper for account/company self-service changes. `action` should
 * be namespaced, e.g. 'profile.update', 'company.update', 'payment_method.create'
 * (recorded as `account.<action>`).
 */
export function auditAccount(
  req: NextRequest | null | undefined,
  options: Omit<BaseAuditOptions, 'category'>
): void {
  audit(req, {
    ...options,
    action: `account.${options.action}`,
    category: AuditCategory.ACCOUNT,
  });
}

/**
 * Convenience helper for catalog/product mutations that originate from GraphQL
 * resolvers (which do not have direct access to a {@link NextRequest}). The
 * client IP is resolved from the per-request DB security context set by the
 * GraphQL handler. `action` should be namespaced, e.g. 'product.create',
 * 'product.update', 'product.delete' (recorded as `catalog.<action>`).
 */
export function auditCatalog(
  options: Omit<BaseAuditOptions, 'category'>
): void {
  const ctx = getDbSecurityContext();
  recordAuditEvent({
    actorType: 'dashboard',
    ip: ctx?.ip,
    ...options,
    action: `catalog.${options.action}`,
    category: AuditCategory.CATALOG,
  });
}
