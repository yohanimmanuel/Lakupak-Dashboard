import type { ReactNode } from 'react';
import { AuthDecorativeBackground } from '@/components/auth/AuthDecorativeBackground';

/** Image stage with animated decorative background behind the media. */
export function FeatureMediaFrame({
  children,
  className = '',
  minHeightClass = 'min-h-[240px] sm:min-h-[360px]',
  framed = true,
}: {
  children: ReactNode;
  className?: string;
  minHeightClass?: string;
  /** When false, children sit directly on the stage (no inner white card). */
  framed?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-b from-[#f8fbff] via-[#eef4fd] to-[#e8f0fb] ${minHeightClass} ${className}`}
    >
      <AuthDecorativeBackground variant="light" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-white/20" />
      <div className="relative z-10 flex h-full min-h-[inherit] items-center justify-center overflow-hidden p-3 sm:p-5">
        {framed ? (
          <div className="w-full rounded-xl border border-white/90 bg-white/95 shadow-[0_16px_40px_-18px_rgba(10,97,215,0.28)] overflow-hidden backdrop-blur-[2px]">
            {children}
          </div>
        ) : (
          <div className="h-full w-full">{children}</div>
        )}
      </div>
    </div>
  );
}
