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
      // Sync NextAuth session to useUserStore
      const sessionUser = session.user as any;
      
      // Only sync if the user data has changed to prevent infinite loops
      if (!user || 
          user.id !== sessionUser.id || 
          user.email !== sessionUser.email ||
          user.firstName !== (sessionUser.firstName || sessionUser.name?.split(' ')[0] || '') ||
          user.lastName !== (sessionUser.lastName || sessionUser.name?.split(' ').slice(1).join(' ') || '')) {
        
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
      // Clear userStore if not authenticated
      if (user) {
        clearUser();
      }
    }
  }, [session, status]); // Removed user, setUser, clearUser from dependencies to prevent infinite loops

  return null; // This component doesn't render anything
}
