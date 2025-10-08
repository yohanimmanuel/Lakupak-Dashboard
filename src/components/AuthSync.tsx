"use client";
import { useSession } from "next-auth/react";
import { useUserStore } from "@/store/userStore";
import { useEffect } from "react";

export function AuthSync() {
  const { data: session, status } = useSession();
  const { setUser, clearUser, isHydrated } = useUserStore();

  useEffect(() => {
    if (status === "loading" || !isHydrated) return;

    if (status === "authenticated" && session?.user) {
      const { user: currentUser } = useUserStore.getState();
      const sessionUser = session.user as {
        id?: number;
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        bio?: string;
        location?: string;
        avatar?: string;
        companyId?: number | null;
        company?: any;
        region?: string;
        currency?: string;
        language?: string;
        name?: string;
        image?: string;
      };

      // Only sync if there's no current user (initial login)
      // Don't force sync if user is already logged in to prevent switching between users
      if (!currentUser) {
        setUser({
          id: sessionUser.id || 0,
          firstName: sessionUser.firstName || sessionUser.name?.split(' ')[0] || '',
          lastName: sessionUser.lastName || sessionUser.name?.split(' ').slice(1).join(' ') || '',
          email: sessionUser.email || '',
          phone: sessionUser.phone || '',
          bio: sessionUser.bio || '',
          location: sessionUser.location || '',
          avatar: sessionUser.avatar || sessionUser.image || '',
          companyId: sessionUser.companyId ?? undefined,
          company: sessionUser.company ?? undefined,
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
