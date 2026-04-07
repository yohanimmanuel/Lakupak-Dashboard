'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, X, Zap } from 'lucide-react';

type Announcement = {
  id: number;
  title: string;
  body: string;
  category: string;
  imageUrl: string | null;
  isPublished: boolean;
};

export default function AnnouncementPublishModal({
  isOpen,
  announcements,
  onCloseAction,
  onPublishedAction,
}: {
  isOpen: boolean;
  announcements: Announcement[];
  onCloseAction: () => void;
  onPublishedAction: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => {
    // Clear timer on unmount or when modal closes.
    if (!isOpen) clearCloseTimer();
    return () => clearCloseTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const publishable = useMemo(
    () => announcements.filter((a) => !a.isPublished),
    [announcements]
  );

  const publish = async () => {
    if (publishable.length === 0) return;
    setPublishing(true);
    setError(null);
    try {
      const settled = await Promise.allSettled(
        publishable.map(async (a) => {
          const r = await fetch(`/api/platform-admin/announcements/${a.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ isPublished: true }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d?.error || `Publish failed (id ${a.id})`);
          }
          return a.id;
        })
      );

      const succeededIds: number[] = [];
      const failures: Array<{ id: number; message: string }> = [];
      settled.forEach((res, idx) => {
        const id = publishable[idx]?.id;
        if (id === undefined || id === null) return;
        if (res.status === 'fulfilled') succeededIds.push(res.value);
        else failures.push({ id, message: res.reason instanceof Error ? res.reason.message : String(res.reason) });
      });

      if (succeededIds.length > 0) {
        setSuccess(true);
        onPublishedAction();
      }

      if (failures.length > 0) {
        setSuccess(false);
        const details = failures.map((f) => `#${f.id}: ${f.message}`).join(' | ');
        setError(succeededIds.length > 0
          ? `${succeededIds.length} published, but ${failures.length} failed: ${details}`
          : `Publish failed: ${details}`);
        return; // keep modal open for retry
      }

      clearCloseTimer();
      closeTimerRef.current = setTimeout(() => {
        setSuccess(false);
        onCloseAction();
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl border border-[#e6e6e6] w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCloseAction}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              Publish preview ({publishable.length} draft{publishable.length !== 1 ? 's' : ''})
            </h2>
          </div>
          <button
            type="button"
            onClick={onCloseAction}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-160px)] p-4 space-y-3">
          {error ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              Published successfully.
            </div>
          ) : null}

          {announcements.map((a) => (
            <div key={a.id} className="border border-[#e6e6e6] rounded-2xl overflow-hidden bg-white">
              <div className="w-full h-40 bg-gray-100">
                {a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                    No image
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{a.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-[#e6e6e6]">
          <button
            type="button"
            disabled={publishing || publishable.length === 0}
            onClick={() => void publish()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white font-semibold text-sm rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            <Zap className="w-4 h-4" />
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
          <p className="text-[11px] text-gray-500 mt-2">
            This will publish {publishable.length} draft announcement{publishable.length !== 1 ? 's' : ''}.
          </p>
        </div>
      </div>
    </div>
  );
}

