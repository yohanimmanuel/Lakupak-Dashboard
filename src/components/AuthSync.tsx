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
      // Only sync if there's no current user in the store
      // This prevents NextAuth from overwriting existing sessions on page reload
      const { user } = useUserStore.getState();
      if (!user) {
        const sessionUser = session.user as {
          id?: number;
          firstName?: string;
          lastName?: string;
          email?: string;
          phone?: string;
          bio?: string;
          location?: string;
          avatar?: string;
          companyId?: number;
          company?: unknown;
          region?: string;
          currency?: string;
          language?: string;
        };
        setUser({
          id: sessionUser.id || 0,
          firstName: sessionUser.firstName || sessionUser.name?.split(' ')[0] || '',
          lastName: sessionUser.lastName || sessionUser.name?.split(' ').slice(1).join(' ') || '',
          email: sessionUser.email || '',
          phone: sessionUser.phone || '',
          bio: sessionUser.bio || '',
          location: sessionUser.location || '',
          avatar: sessionUser.avatar || sessionUser.image || '',
          companyId: sessionUser.companyId || null,
          company: sessionUser.company || null,
          region: sessionUser.region || 'ID',
          currency: sessionUser.currency || 'IDR',
          language: sessionUser.language || 'en',
        });
      }
    } else if (status === "unauthenticated") {
      // Don't clear user store on NextAuth unauthenticated
      // Let the dashboard handle authentication checks
    }
  }, [session, status, setUser, clearUser, isHydrated]);

  return null;
}
