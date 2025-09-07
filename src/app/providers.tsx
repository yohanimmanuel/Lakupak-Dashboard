"use client";
import React from "react";
import { SessionProvider } from "next-auth/react";
import { AuthSync } from "@/components/AuthSync";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthSync />
      {children}
    </SessionProvider>
  );
}


