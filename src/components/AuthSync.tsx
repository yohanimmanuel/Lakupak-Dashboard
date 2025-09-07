"use client";
import { useSession } from "next-auth/react";
import { useUserStore } from "@/store/userStore";
import { useEffect } from "react";

export function AuthSync() {
  const { data: session, status } = useSession();
  const { user, setUser, clearUser } = useUserStore();

  useEffect(() => {
    if (status === "loading") return; // Still loading

    if (status === "authenticated" && session?.user) {
      // Sync NextAuth session to useUserStore if not already synced
      const sessionUser = session.user as any;
      
      if (!user || user.email !== sessionUser.email) {
        setUser({
          id: sessionUser.id || 0,
          firstName: sessionUser.firstName || sessionUser.name?.split(' ')[0] || '',
          lastName: sessionUser.lastName || sessionUser.name?.split(' ').slice(1).join(' ') || '',
          email: sessionUser.email || '',
          company: sessionUser.company || '',
          address: sessionUser.address || '',
          region: sessionUser.region || '',
          currency: sessionUser.currency || 'IDR',
        });
      }
    } else if (status === "unauthenticated") {
      // Clear userStore if not authenticated
      if (user) {
        clearUser();
      }
    }
  }, [session, status, user, setUser, clearUser]);

  return null; // This component doesn't render anything
}
