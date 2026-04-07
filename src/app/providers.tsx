"use client";
import React from "react";
import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { AuthSync } from "@/components/AuthSync";
import { SessionWarningModal } from "@/components/SessionWarningModal";
import { SuspendedAccountModal } from "@/components/SuspendedAccountModal";

function DashboardOnlyOverlays() {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdmin) return null;
  return (
    <>
      <AuthSync />
      <SessionWarningModal />
      <SuspendedAccountModal />
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <SessionProvider 
      refetchInterval={isAdmin ? 0 : 10} // Only refetch quickly on dashboard pages
      refetchOnWindowFocus={false} // Disable automatic refetch on window focus to reduce requests
    >
      <DashboardOnlyOverlays />
      {children}
    </SessionProvider>
  );
}


