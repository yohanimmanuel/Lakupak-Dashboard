"use client";

import React from "react";
import { useLocale } from "next-intl";

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useLocale();
  
  return <>{children}</>;
}