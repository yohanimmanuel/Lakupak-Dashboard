'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ImagePlus, Upload, X } from 'lucide-react';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';

export type EditableAnnouncement = {
  id?: number;
  title: string;
  body: string;
  category: string;
  imageUrl?: string | null;
  isPublished?: boolean;
};

export default function AnnouncementEditorModal({
  open,
  mode,
  initial,
  onCloseAction,
  onSavedAction,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: EditableAnnouncement | null;
  onCloseAction: () => void;
  onSavedAction: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('update');
  const [imageUrl, setImageUrl] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setShowCategoryDropdown(false);
    setUploadingImage(false);
    setTitle(initial?.title ?? '');
    setBody(initial?.body ?? '');
    setCategory(initial?.category ?? 'update');
    setImageUrl(initial?.imageUrl ?? '');
    setIsPublished(Boolean(initial?.isPublished));
  }, [open, initial]);

  const canSave = useMemo(() => title.trim().length >= 3 && body.trim().length >= 3, [title, body]);

  const categoryOptions = useMemo(
    () => [
      { value: 'update', label: 'Update' },
      { value: 'promotion', label: 'Promotion' },
      { value: 'maintenance', label: 'Maintenance' },
      { value: 'policy', label: 'Policy' },
    ],
    []
  );

  const uploadImage = async (file: File) => {
    setUploadingImage(true);
    setError(null);
    try {
      const result = await uploadToCloudinaryDirect(file, 'banners');
      if (!result.success || !result.url) throw new Error(result.error || 'Upload failed');
      setImageUrl(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        category: category.trim() || 'update',
        imageUrl: imageUrl.trim() || null,
        isPublished,
      };

      const res =
        mode === 'create'
          ? await fetch('/api/platform-admin/announcements', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/platform-admin/announcements/${initial?.id}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Save failed');
      }
      onSavedAction();
      onCloseAction();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl bg-white rounded-lg border border-[#e6e6e6] shadow-xl overflow-hidden">
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#e6e6e6]">
          <div>
            <p className="text-base font-semibold text-gray-900">
              {mode === 'create' ? 'Create announcement' : 'Edit announcement'}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">Create announcements that appear in the Marketplace app under “Latest updates”.</p>
          </div>
          <button
            onClick={onCloseAction}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error ? (
            <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="md:col-span-2 space-y-1">
              <span className="text-xs font-medium text-gray-700">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7]"
                placeholder="e.g. v1.0.8 update is live"
              />
            </label>

            <div className="relative">
              <span className="text-xs font-medium text-gray-700">Category</span>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-100 text-xs"
                onClick={() => setShowCategoryDropdown((v) => !v)}
              >
                <span className="truncate">
                  {categoryOptions.find((o) => o.value === category)?.label ?? 'Select'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>

              {showCategoryDropdown ? (
                <div className="absolute right-0 mt-2 w-full bg-white border border-[#e6e6e6] rounded-lg shadow z-20 overflow-hidden">
                  {categoryOptions.map((opt) => {
                    const isActive = opt.value === category;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setCategory(opt.value);
                          setShowCategoryDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between ${
                          isActive ? 'bg-[#0a61d7] text-white' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isActive ? <Check className="w-4 h-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-700">Body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] resize-y"
              placeholder="Write a short update users will see in the Marketplace notifications page."
            />
          </label>

          <div className="gap-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-700">Image (optional)</span>
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 flex items-center gap-2">
                      <ImagePlus className="w-4 h-4 text-gray-600" />
                      Upload announcement image
                    </p>
                    <p className="text-[11px] text-gray-600 mt-1 truncate">
                      {imageUrl ? imageUrl : 'PNG/JPG/WebP up to 10MB.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {imageUrl ? (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        disabled={uploadingImage}
                      >
                        Remove
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a61d7] text-white text-xs font-medium hover:bg-[#084ba6] disabled:opacity-50"
                      disabled={uploadingImage}
                    >
                      <Upload className="w-4 h-4" />
                      {uploadingImage ? 'Uploading…' : 'Upload'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadImage(f);
                      }}
                    />
                  </div>
                </div>

                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt="Announcement"
                    className="mt-3 w-full h-28 object-cover rounded-lg border border-gray-200"
                  />
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPublished((v) => !v)}
            className="w-full flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50"
          >
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Publish immediately</p>
              <p className="text-xs text-gray-600 mt-0.5">If enabled, it becomes visible in Marketplace.</p>
            </div>
            <div
              className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all ${
                isPublished ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
              }`}
              aria-hidden="true"
            >
              {isPublished ? <Check className="w-4 h-4 text-white" /> : null}
            </div>
          </button>
        </div>

        <div className="px-5 py-4 border-t border-[#e6e6e6] flex items-center justify-end gap-2">
          <button
            onClick={onCloseAction}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white text-sm font-medium hover:bg-[#084ba6] disabled:opacity-50 disabled:hover:bg-[#0a61d7]"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

