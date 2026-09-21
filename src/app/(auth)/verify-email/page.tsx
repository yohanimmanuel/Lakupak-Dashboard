"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { AuthDecorativeBackground } from "@/components/auth/AuthDecorativeBackground";
import { AuthLanguageSwitcher } from "@/components/auth/AuthLanguageSwitcher";
import { useAuthTranslations } from "@/hooks/useAuthTranslations";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const { tRegister } = useAuthTranslations();
  const token = (searchParams?.get("token") ?? "").trim();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage(tRegister("verifyMissingToken"));
      return;
    }

    let cancelled = false;
    setState("working");
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setState("error");
          setMessage(typeof data?.error === "string" ? data.error : tRegister("verifyFailed"));
          return;
        }
        setState("ok");
        setMessage(
          data?.alreadyVerified ? tRegister("verifyAlreadyDone") : tRegister("verifySuccess"),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
        setMessage(tRegister("verifyFailed"));
      });

    return () => {
      cancelled = true;
    };
  }, [token, tRegister]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-white via-[#f8fbff] to-[#eef4fd]">
      <AuthDecorativeBackground variant="light" />
      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col p-6">
        <div className="rounded-xl border border-white/80 bg-white/95 p-8 shadow-lg shadow-[#0a61d7]/5 backdrop-blur-sm text-center">
          <a href="/" className="inline-block mb-6">
            <img src="/Lakupak!.svg" alt="Lakupak" className="h-10 mx-auto" />
          </a>
          {state === "working" ? (
            <Loader2 className="w-10 h-10 animate-spin text-[#0a61d7] mx-auto mb-4" />
          ) : state === "ok" ? (
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-4" />
          ) : (
            <MailWarning className="w-10 h-10 text-amber-600 mx-auto mb-4" />
          )}
          <h1 className="text-2xl font-bold text-gray-900">
            {state === "working"
              ? tRegister("verifyWorkingTitle")
              : state === "ok"
                ? tRegister("verifySuccessTitle")
                : tRegister("verifyFailedTitle")}
          </h1>
          <p className="mt-3 text-sm text-gray-600">{message || tRegister("verifyWorkingBody")}</p>
          <a
            href="/login"
            className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#0a61d7] text-white text-sm font-semibold hover:bg-[#084ba6]"
          >
            {tRegister("goToLogin")}
          </a>
          <div className="mt-6">
            <AuthLanguageSwitcher variant="register" />
          </div>
        </div>
      </main>
    </div>
  );
}
