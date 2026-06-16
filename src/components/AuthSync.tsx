"use client";
import { useSession } from "next-auth/react";
import { useUserStore } from "@/store/userStore";
import { useEffect } from "react";

/** Decimal-like value (Prisma) or number */
function toNumber(value: unknown): number | null | undefined {
  if (value == null) return value as null | undefined;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    // Handle accidentally double-stringified primitives, e.g. "\"2\"" -> "2"
    const unquoted =
      trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1)
        : trimmed;
    const n = Number(unquoted);
    return Number.isNaN(n) ? undefined : n;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function dateToStore(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

/** Company shape expected by userStore (numbers and date strings, not Prisma Decimal/Date) */
interface StoreCompany {
  id: number;
  name: string;
  documentVerification: boolean;
  businessLicenseVerification: boolean;
  complianceStatus: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  [key: string]: unknown;
}

/**
 * Normalize session company (may have Prisma Decimals/Dates) to userStore Company shape.
 */
function normalizeCompanyForStore(company: Record<string, unknown> | null | undefined): StoreCompany | undefined {
  if (!company || typeof company !== "object") return undefined;
  // Validate required fields
  if (typeof company.id !== "number" || typeof company.name !== "string") {
    return undefined;
  }
  const decimalKeys = [
    "defaultDeliveryLeadTimeMinDays", "defaultDeliveryLeadTimeMaxDays", "buyerPaymentTermDays",
  ];
  const out: Record<string, unknown> = { ...company };
  for (const key of decimalKeys) {
    if (key in out) out[key] = toNumber(out[key]);
  }
  out.createdAt = dateToStore(out.createdAt ?? "");
  out.updatedAt = dateToStore(out.updatedAt ?? "");
  out.documentVerification = typeof out.documentVerification === "boolean" ? out.documentVerification : false;
  out.businessLicenseVerification = typeof out.businessLicenseVerification === "boolean" ? out.businessLicenseVerification : false;
  out.complianceStatus = typeof out.complianceStatus === "string" ? out.complianceStatus : "";
  return out as StoreCompany;
}

export function AuthSync() {
  const { data: session, status } = useSession();
  const { setUser, clearUser, isHydrated } = useUserStore();

  useEffect(() => {
    if (status === "loading" || !isHydrated) return;

    if (status === "authenticated" && session?.user) {
      const { user: currentUser } = useUserStore.getState();
      const sessionUser = session.user as {
        id?: string | number;
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        bio?: string;
        location?: string;
        avatar?: string;
        companyId?: number | null;
        company?: Record<string, unknown> | null;
        region?: string;
        currency?: string;
        language?: string;
        name?: string;
        image?: string;
      };

      // Only sync if there's no current user (initial login)
      // Don't force sync if user is already logged in to prevent cross-browser contamination
      if (!currentUser) {
        const normalizedId = toNumber(sessionUser.id) ?? 0;
        setUser({
          id: normalizedId,
          firstName: sessionUser.firstName || sessionUser.name?.split(' ')[0] || '',
          lastName: sessionUser.lastName || sessionUser.name?.split(' ').slice(1).join(' ') || '',
          email: sessionUser.email || '',
          phone: sessionUser.phone || '',
          bio: sessionUser.bio || '',
          location: sessionUser.location || '',
          avatar: sessionUser.avatar || sessionUser.image || '',
          companyId: sessionUser.companyId ?? undefined,
          company: normalizeCompanyForStore(sessionUser.company ?? undefined),
          region: sessionUser.region || 'ID',
          currency: sessionUser.currency || 'IDR',
          language: sessionUser.language || 'en',
        });
      }
    } else if (status === "unauthenticated") {
      // Only clear user store if we don't have a valid user session
      // This prevents clearing user data when NextAuth is unauthenticated but user is logged in via custom auth
      const { user: currentUser, sessionExpiry } = useUserStore.getState();
      const now = Date.now();
      
      // Only clear if no user or session expired
      if (!currentUser || (sessionExpiry && now >= sessionExpiry)) {
        clearUser();
      }
    }
  }, [session, status, setUser, clearUser, isHydrated]);

  return null;
}
