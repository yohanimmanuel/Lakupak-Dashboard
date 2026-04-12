'use client';

import { X } from 'lucide-react';

type MapFullscreenModalProps = {
  open: boolean;
  onClose: () => void;
  /** Shown in the top bar next to close; omit for map-only overlay (close button only). */
  title?: string;
  children: React.ReactNode;
};

/**
 * Full-screen style map modal (matches orders GPS / logistics pattern).
 * Map children must live in a box with explicit height — pass maps with height="100%" inside the default slot layout.
 */
export default function MapFullscreenModal({ open, onClose, title, children }: MapFullscreenModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="relative flex w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div
          className={`flex shrink-0 items-center border-b border-gray-200 px-4 py-3 ${title ? 'justify-between gap-3' : 'justify-end'}`}
        >
          {title ? <h2 className="text-sm font-semibold text-gray-900">{title}</h2> : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
            aria-label="Close map"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        {/* Explicit vh height so Mapbox tiles render (percentage height was collapsing). */}
        <div className="w-full p-4">
          <div className="h-[75vh] min-h-[360px] w-full max-h-[calc(100vh-7rem)] overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
