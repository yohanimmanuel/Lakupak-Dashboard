"use client";
import React from "react";
import { SessionProvider } from "next-auth/react";
import { AuthSync } from "@/components/AuthSync";
import { SessionWarningModal } from "@/components/SessionWarningModal";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider 
      refetchInterval={5 * 60} // Refetch session every 5 minutes instead of on every render
      refetchOnWindowFocus={false} // Disable automatic refetch on window focus to reduce requests
    >
      <AuthSync />
      <SessionWarningModal />
      {children}
    </SessionProvider>
  );
}


