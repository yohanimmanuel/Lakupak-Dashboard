"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, MailWarning } from "lucide-react";
import { AuthDecorativeBackground } from "@/components/auth/AuthDecorativeBackground";
import { AuthLanguageSwitcher } from "@/components/auth/AuthLanguageSwitcher";
import { useAuthTranslations } from "@/hooks/useAuthTranslations";
import { ErrorMessage, LoadingButton } from "@/utils/auth-enhancements";

type KycStoredFile = { url: string; name: string; publicId: string | null };

function KycFileField({
  label,
  hint,
  chooseLabel,
  replaceLabel,
  uploadingLabel,
  file,
  uploading,
  onFile,
}: {
  label: string;
  hint: string;
  chooseLabel: string;
  replaceLabel: string;
  uploadingLabel: string;
  file: KycStoredFile | null;
  uploading: boolean;
  onFile: (file: File | null) => void;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <label className="block text-sm text-gray-500">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <FileUp className="w-4 h-4 text-[#0a61d7] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-900 truncate">
            {uploading ? uploadingLabel : file?.name || chooseLabel}
          </p>
          <p className="text-[11px] text-gray-500">{hint}</p>
        </div>
        <label className="shrink-0 cursor-pointer text-xs font-semibold text-[#0a61d7] hover:underline">
          {file ? replaceLabel : chooseLabel}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              onFile(next);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

export default function ResubmitKycPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      }
    >
      <ResubmitKycInner />
    </Suspense>
  );
}

function ResubmitKycInner() {
  const searchParams = useSearchParams();
  const { tRegister, tRegisterError } = useAuthTranslations();
  const token = (searchParams?.get("token") ?? "").trim();
  const [pageState, setPageState] = useState<"loading" | "ready" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [kycDocs, setKycDocs] = useState<{ nib: KycStoredFile | null; npwp: KycStoredFile | null }>({
    nib: null,
    npwp: null,
  });
  const [kycUploading, setKycUploading] = useState<"nib" | "npwp" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setPageState("error");
      setError(tRegister("resubmitMissingToken"));
      return;
    }
    let cancelled = false;
    fetch(`/api/auth/kyc-resubmit?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        setPageState((prev) => {
          if (prev === "done") return prev;
          if (!res.ok) return "error";
          return "ready";
        });
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : tRegister("resubmitInvalid"));
          return;
        }
        setEmail(typeof data?.email === "string" ? data.email : "");
      })
      .catch(() => {
        if (cancelled) return;
        setPageState((prev) => (prev === "done" ? prev : "error"));
        setError(tRegister("resubmitInvalid"));
      });
    return () => {
      cancelled = true;
    };
    // tRegister is recreated every render; re-fetching would treat a consumed token as expired after submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleKycFile = useCallback(
    async (kind: "nib" | "npwp", file: File | null) => {
      if (!file) {
        setKycDocs((prev) => ({ ...prev, [kind]: null }));
        return;
      }
      setKycUploading(kind);
      setError("");
      try {
        const fd = new FormData();
        fd.append("kind", kind);
        fd.append("file", file);
        const res = await fetch("/api/auth/register/kyc-upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => null);
        if (!res.ok || typeof data?.url !== "string") {
          throw new Error(typeof data?.error === "string" ? data.error : tRegisterError("kycUploadFailed"));
        }
        setKycDocs((prev) => ({
          ...prev,
          [kind]: {
            url: data.url,
            name: typeof data.name === "string" ? data.name : file.name,
            publicId: typeof data.publicId === "string" ? data.publicId : null,
          },
        }));
      } catch (err) {
        setKycDocs((prev) => ({ ...prev, [kind]: null }));
        setError(err instanceof Error ? err.message : tRegisterError("kycUploadFailed"));
      } finally {
        setKycUploading(null);
      }
    },
    [tRegisterError],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!kycDocs.nib?.url || !kycDocs.npwp?.url) {
        setError(tRegisterError("completeRequired"));
        return;
      }
      setSaving(true);
      setError("");
      try {
        const res = await fetch("/api/auth/kyc-resubmit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            nibDocumentUrl: kycDocs.nib.url,
            nibDocumentName: kycDocs.nib.name,
            nibDocumentPublicId: kycDocs.nib.publicId,
            npwpDocumentUrl: kycDocs.npwp.url,
            npwpDocumentName: kycDocs.npwp.name,
            npwpDocumentPublicId: kycDocs.npwp.publicId,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : tRegister("resubmitFailed"));
          return;
        }
        setPageState("done");
      } catch {
        setError(tRegister("resubmitFailed"));
      } finally {
        setSaving(false);
      }
    },
    [kycDocs, token, tRegister, tRegisterError],
  );

  const canSubmit = Boolean(kycDocs.nib?.url && kycDocs.npwp?.url && !kycUploading && !saving);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-white via-[#f8fbff] to-[#eef4fd]">
      <AuthDecorativeBackground variant="light" />
      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col p-6">
        <div className="rounded-xl border border-white/80 bg-white/95 p-8 shadow-lg shadow-[#0a61d7]/5 backdrop-blur-sm">
          <a href="/" className="inline-block mb-6">
            <img src="/Lakupak!.svg" alt="Lakupak" className="h-10" />
          </a>

          {pageState === "loading" ? (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-[#0a61d7] mx-auto mb-4" />
              <p className="text-sm text-gray-600">{tRegister("resubmitChecking")}</p>
            </div>
          ) : null}

          {pageState === "error" ? (
            <div className="text-center">
              <MailWarning className="w-10 h-10 text-amber-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900">{tRegister("resubmitFailedTitle")}</h1>
              <p className="mt-3 text-sm text-gray-600">{error}</p>
              <a
                href="/login"
                className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#0a61d7] text-white text-sm font-semibold hover:bg-[#084ba6]"
              >
                {tRegister("goToLogin")}
              </a>
            </div>
          ) : null}

          {pageState === "done" ? (
            <div className="text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900">{tRegister("resubmitSuccessTitle")}</h1>
              <p className="mt-3 text-sm text-gray-600">{tRegister("resubmitSuccess")}</p>
              <a
                href="/login"
                className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#0a61d7] text-white text-sm font-semibold hover:bg-[#084ba6]"
              >
                {tRegister("goToLogin")}
              </a>
            </div>
          ) : null}

          {pageState === "ready" ? (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{tRegister("resubmitTitle")}</h1>
                <p className="mt-2 text-sm text-gray-600">
                  {tRegister("resubmitBody", { email: email || "—" })}
                </p>
              </div>
              {error ? <ErrorMessage message={error} onClose={() => setError("")} /> : null}
              <KycFileField
                label={tRegister("nibDocument")}
                hint={tRegister("kycUploadHint")}
                chooseLabel={tRegister("kycChooseFile")}
                replaceLabel={tRegister("kycReplaceFile")}
                uploadingLabel={tRegister("kycUploading")}
                file={kycDocs.nib}
                uploading={kycUploading === "nib"}
                onFile={(file) => void handleKycFile("nib", file)}
              />
              <KycFileField
                label={tRegister("npwpDocument")}
                hint={tRegister("kycUploadHint")}
                chooseLabel={tRegister("kycChooseFile")}
                replaceLabel={tRegister("kycReplaceFile")}
                uploadingLabel={tRegister("kycUploading")}
                file={kycDocs.npwp}
                uploading={kycUploading === "npwp"}
                onFile={(file) => void handleKycFile("npwp", file)}
              />
              <LoadingButton
                type="submit"
                loading={saving}
                loadingText={tRegister("resubmitSaving")}
                disabled={!canSubmit}
                className="w-full px-6 py-2.5 rounded-lg bg-[#0a61d7] text-white font-medium hover:bg-[#084ba6] text-sm"
              >
                {tRegister("resubmitSubmit")}
              </LoadingButton>
            </form>
          ) : null}

          <div className="mt-6 text-center">
            <AuthLanguageSwitcher variant="register" />
          </div>
        </div>
      </main>
    </div>
  );
}
